/*
  Database helper for Minimal3D.

  Goal of this file:
  - Keep all Supabase database communication in one place.
  - Save machine placements from the canvas into the `machines` table.
  - Restore saved machines when the page opens again.
  - Keep the code approachable for beginners by explaining each step.

  Important note about column names:
  The defaults below assume these columns exist:
  - machines.id
  - machines.positionX
  - machines.positionY   (used as Three.js Z)
  - machines.rotationZ   (used as Three.js Y rotation)
  - machines.machine_type_id (foreign key to machine_types.id)
  - machine_types.id
  - machine_types.name
  - machine_types.model
  - machine_type_links.machine_type_id (foreign key to machine_types.id)

  If your real database uses slightly different names, edit the small config block below.
*/
W3D.Database = {
  // Central place for table names.
  // Keeping names here makes the rest of the file much easier to read.
  tables: {
    machines: 'machines',
    machineTypes: 'machine_types',
    machineTypeLinks: 'machine_type_links',
  },

  // Central place for column names we WRITE to.
  // We use simple property names in code, then map them to actual database columns here.
  columns: {
    machineId: 'id',
    machinePositionX: 'positionX',
    machinePositionZ: 'positionY',
    machineRotationY: 'rotationZ',
    machineTypeForeignKey: 'machine_type_id',

    machineTypeId: 'id',
    machineTypeName: 'name',
    machineTypeModelPath: 'model',

    machineTypeLinkId: 'id',
    machineTypeLinkOne: 'course_url',
    machineTypeLinkTwo: 'maintenance_url',
    machineTypeLinkThree: 'safety_url',
    machineTypeLinkMachineTypeForeignKey: 'machine_type_id',
  },

  // Fallback read keys help when a table already exists with a slightly different column name.
  // Example: the user message contained "postion X" with a typo, so we support that during reads.
  readColumns: {
    machinePositionX: ['positionX', 'postion X', 'position_x'],
    machinePositionZ: ['positionY', 'positionZ', 'position_y', 'position_z'],
    machineRotationY: ['rotationZ', 'rotationY', 'rotation_y', 'rotation_z'],
    machineTypeForeignKey: ['machine_type_id', 'model', 'machine_type', 'machineTypeId'],
  },

  // Small cache of UI elements used by this database feature.
  ui: {
    saveButton: null,
    status: null,
    unsavedAlert: null,
  },

  // Flags that prevent duplicate scene loads.
  _hasLoadedPlacements: false,
  _loadingPlacementsPromise: null,
  _hasUnsavedChanges: false,
  _saveControlsLocked: true,
  _statusHideTimer: null,

  _machineLabel(count) {
    return count === 1 ? 'machinepositie' : 'machineposities';
  },

  // Prepare database-related UI once the page is ready.
  setupUI() {
    this.ui.saveButton = document.getElementById('btn-save-layout');
    this.ui.status = document.getElementById('db-status');
    this.ui.unsavedAlert = document.getElementById('unsaved-alert');

    if (this.ui.saveButton) {
      this.ui.saveButton.addEventListener('click', () => {
        this.saveScenePlacements();
      });
    }

    // Start locked. The page will unlock saving only after the right auth state exists.
    this.setControlsDisabled(true);
    this._renderUnsavedState();
  },

  // Enable or disable the Save button.
  // Viewer mode does not have this button, so the checks stay defensive.
  setControlsDisabled(isDisabled) {
    this._saveControlsLocked = Boolean(isDisabled);
    this._renderUnsavedState();
  },

  // Show status in both the admin topbar and the uploader drawer.
  // Reusing one message keeps feedback consistent no matter which panel is visible.
  setStatus(message, isError = false, options = {}) {
    const autoHideMs = Number.isFinite(options.autoHideMs) ? options.autoHideMs : 3600;

    if (this._statusHideTimer) {
      window.clearTimeout(this._statusHideTimer);
      this._statusHideTimer = null;
    }

    if (this.ui.status) {
      this.ui.status.textContent = message || '';
      this.ui.status.classList.toggle('is-error', Boolean(isError));
      this.ui.status.classList.toggle('is-ok', !isError && Boolean(message));
    }

    if (message && autoHideMs > 0 && this.ui.status) {
      this._statusHideTimer = window.setTimeout(() => {
        if (!this.ui.status) return;
        this.ui.status.textContent = '';
        this.ui.status.classList.remove('is-error', 'is-ok');
        this._statusHideTimer = null;
      }, autoHideMs);
    }

    if (W3D.Supabase && typeof W3D.Supabase.setStatus === 'function') {
      W3D.Supabase.setStatus(message, isError);
    }
  },

  // Tell the UI that the canvas no longer matches the database.
  // We keep this in one helper so add, move, rotate, and delete all show the same warning.
  markSceneDirty() {
    this._hasUnsavedChanges = true;
    this._renderUnsavedState();
  },

  // Clear the warning after a successful save or after restoring from the database.
  clearSceneDirty() {
    this._hasUnsavedChanges = false;
    this._renderUnsavedState();
  },

  // Show or hide the red warning badge in the center-top of the viewport.
  _renderUnsavedState() {
    if (this.ui.unsavedAlert) {
      this.ui.unsavedAlert.classList.toggle('is-hidden', !this._hasUnsavedChanges);
    }

    if (this.ui.saveButton) {
      const canSave = !this._saveControlsLocked && this._hasUnsavedChanges;
      this.ui.saveButton.disabled = !canSave;
      this.ui.saveButton.classList.toggle('active', canSave);
      this.ui.saveButton.setAttribute('aria-disabled', canSave ? 'false' : 'true');
    }
  },

  // Ensure we have a Supabase client before any database work starts.
  async _ensureClient() {
    if (W3D.Supabase && W3D.Supabase.client) {
      return W3D.Supabase.client;
    }

    if (W3D.Supabase && typeof W3D.Supabase.initializeFromConfig === 'function') {
      await W3D.Supabase.initializeFromConfig();
    }

    if (W3D.Supabase && W3D.Supabase.client) {
      return W3D.Supabase.client;
    }

    throw new Error((W3D.Supabase && W3D.Supabase.lastInitError) || 'De opslag is op dit moment niet beschikbaar.');
  },

  // Read one value from a row while supporting fallback column names.
  _readRowValue(row, writeColumnName, fallbackNames = []) {
    if (!row || typeof row !== 'object') return undefined;

    const candidateNames = [writeColumnName, ...fallbackNames];
    for (const key of candidateNames) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        return row[key];
      }
    }

    return undefined;
  },

  // Turn a raw database value into a safe number.
  // If the value is missing or invalid, we fall back to 0 so the scene stays stable.
  _toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },

  // Convert any stored model reference into a clean storage path when possible.
  // Why this exists:
  // - Older rows may contain full Supabase URLs instead of bucket-relative paths.
  // - Signed URLs expire, so we must recover the path and generate a fresh URL.
  _normalizeStoragePath(rawValue) {
    if (!rawValue) return '';

    const value = String(rawValue).trim();
    if (!value) return '';

    const bucket = (W3D.Supabase && W3D.Supabase.config && W3D.Supabase.config.bucket) || '';

    // Helper: remove leading slashes and (optionally) the bucket prefix.
    // Some older rows stored paths like "models/file.glb" instead of just "file.glb".
    const stripBucketPrefix = (pathValue) => {
      if (!pathValue) return '';
      const withoutLeadingSlash = String(pathValue).replace(/^\/+/, '');
      if (bucket && withoutLeadingSlash.startsWith(`${bucket}/`)) {
        return withoutLeadingSlash.slice(bucket.length + 1);
      }
      return withoutLeadingSlash;
    };

    // Handle raw values that already contain a Supabase storage object URL/path,
    // even when they are not full absolute URLs.
    const objectPathPattern = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/;
    const inlineObjectMatch = value.match(objectPathPattern);
    if (inlineObjectMatch) {
      const encodedBucket = inlineObjectMatch[1] || '';
      const encodedObjectPathWithQuery = inlineObjectMatch[2] || '';
      const encodedObjectPath = encodedObjectPathWithQuery.split('?')[0];
      const decodedBucket = decodeURIComponent(encodedBucket);
      const decodedPath = decodeURIComponent(encodedObjectPath);

      if (bucket && decodedBucket && decodedBucket !== bucket) {
        console.warn('Model reference bucket differs from configured bucket:', {
          configuredBucket: bucket,
          bucketFromReference: decodedBucket,
          modelReference: value,
        });
      }

      return stripBucketPrefix(decodedPath);
    }

    // Already a relative storage path.
    if (!/^https?:\/\//i.test(value)) {
      return stripBucketPrefix(value);
    }

    try {
      const parsed = new URL(value);
      const match = parsed.pathname.match(objectPathPattern);
      if (!match) {
        // Non-Supabase URL, keep as-is so the loader can still try to fetch it.
        return value;
      }

      const encodedBucket = match[1] || '';
      const encodedObjectPath = match[2] || '';
      const bucketFromUrl = decodeURIComponent(encodedBucket);
      const objectPath = decodeURIComponent(encodedObjectPath);

      // Warn when bucket differs. We still return the path so loading can continue.
      if (bucket && bucketFromUrl && bucketFromUrl !== bucket) {
        console.warn('Model URL bucket differs from configured bucket:', {
          configuredBucket: bucket,
          bucketFromUrl,
          modelReference: value,
        });
      }

      return stripBucketPrefix(objectPath);
    } catch (error) {
      // If URL parsing fails, keep original value for fallback behavior.
      return stripBucketPrefix(value);
    }
  },

  // Build a list of model URLs to try in order.
  // Why multiple candidates:
  // - Old rows can hold full URLs, signed URLs, or bucket-prefixed paths.
  // - Trying a few safe variants avoids hard-failing the entire restore.
  async _buildModelUrlCandidates(modelReference) {
    const client = await this._ensureClient();
    const bucket = W3D.Supabase && W3D.Supabase.config ? W3D.Supabase.config.bucket : '';
    if (!bucket) {
      throw new Error('De opslag is op dit moment niet beschikbaar.');
    }

    const rawValue = modelReference ? String(modelReference).trim() : '';
    const normalizedPath = this._normalizeStoragePath(rawValue);
    const candidates = [];

    const pushUnique = (url) => {
      if (!url) return;
      if (!candidates.includes(url)) {
        candidates.push(url);
      }
    };

    // If database already stores a direct URL, keep it as fallback candidate.
    if (/^https?:\/\//i.test(rawValue)) {
      pushUnique(rawValue);
    }

    if (normalizedPath && !/^https?:\/\//i.test(normalizedPath)) {
      const storageRef = client.storage.from(bucket);

      // 1) Signed URL (works for private buckets).
      const { data: signedData, error: signedError } = await storageRef.createSignedUrl(normalizedPath, 60 * 60);
      if (!signedError && signedData && signedData.signedUrl) {
        pushUnique(signedData.signedUrl);
      }

      // 2) Public URL (works for public buckets).
      const { data: publicData } = storageRef.getPublicUrl(normalizedPath);
      if (publicData && publicData.publicUrl) {
        pushUnique(publicData.publicUrl);
      }
    } else if (/^https?:\/\//i.test(normalizedPath)) {
      pushUnique(normalizedPath);
    }

    if (candidates.length === 0) {
      throw new Error('Een model kon niet worden voorbereid om te laden.');
    }

    return {
      normalizedPath,
      urls: candidates,
    };
  },

  // Only remote-storage models should become machine placements in the database.
  // Static floor plans and locally uploaded temporary files are not part of the machines table.
  _getPersistableObjects() {
    return W3D.objects.filter(obj => {
      return Boolean(
        obj &&
        !obj.static &&
        obj.mesh &&
        obj.props &&
        obj.props.storagePath
      );
    });
  },

  // Helper for creating a storage URL that works with both public and private buckets.
  async _buildModelUrl(storagePath) {
    const client = await this._ensureClient();
    const bucket = W3D.Supabase && W3D.Supabase.config ? W3D.Supabase.config.bucket : '';
    if (!bucket) {
      throw new Error('De opslag is op dit moment niet beschikbaar.');
    }

    const normalizedPath = this._normalizeStoragePath(storagePath);
    if (!normalizedPath) {
      throw new Error('Er ontbreekt een gekoppeld modelbestand.');
    }

    // External non-Supabase URLs can still be loaded directly.
    if (/^https?:\/\//i.test(normalizedPath)) {
      return normalizedPath;
    }

    const storageRef = client.storage.from(bucket);

    const { data: signedData, error: signedError } = await storageRef.createSignedUrl(normalizedPath, 60 * 60);
    if (!signedError && signedData && signedData.signedUrl) {
      return signedData.signedUrl;
    }

    const { data: publicData } = storageRef.getPublicUrl(normalizedPath);
    if (publicData && publicData.publicUrl) {
      return publicData.publicUrl;
    }

    throw new Error('Het model kon niet worden voorbereid om te laden.');
  },

  // Read all machine types and index them by storage path.
  // We use storage path as the lookup key because that tells us which 3D file each type represents.
  async _fetchMachineTypesByStoragePath(client) {
    const { data, error } = await client
      .from(this.tables.machineTypes)
      .select('*');

    if (error) {
      throw new Error('De machinegegevens konden niet worden opgehaald.');
    }

    const machineTypesByStoragePath = new Map();
    (data || []).forEach(row => {
      const rawStoragePath = row[this.columns.machineTypeModelPath];
      const normalizedStoragePath = this._normalizeStoragePath(rawStoragePath);

      if (rawStoragePath) {
        machineTypesByStoragePath.set(rawStoragePath, row);
      }

      if (normalizedStoragePath) {
        machineTypesByStoragePath.set(normalizedStoragePath, row);
      }
    });

    return machineTypesByStoragePath;
  },

  // Read all machine type link rows and index them by their parent machine type id.
  // The current schema stores the foreign key on machine_type_links instead of machine_types.
  async _fetchMachineTypeLinksByMachineTypeId(client) {
    const { data, error } = await client
      .from(this.tables.machineTypeLinks)
      .select('*');

    if (error) {
      throw new Error('De koppelingen van machines konden niet worden opgehaald.');
    }

    const machineTypeLinksByMachineTypeId = new Map();
    (data || []).forEach(row => {
      const machineTypeId = row[this.columns.machineTypeLinkMachineTypeForeignKey];
      if (machineTypeId == null) return;
      machineTypeLinksByMachineTypeId.set(machineTypeId, row);
    });

    return machineTypeLinksByMachineTypeId;
  },

  // Make sure a machine type exists for a loaded model.
  // If the type is missing, we create it automatically so Save keeps working for new models.
  async _ensureMachineType(client, machineTypesByStoragePath, objectEntry) {
    const storagePath = objectEntry && objectEntry.props ? objectEntry.props.storagePath : '';
    const normalizedStoragePath = this._normalizeStoragePath(storagePath);
    if (!storagePath) {
      throw new Error('Een machine mist een gekoppeld modelbestand.');
    }

    const existingType = machineTypesByStoragePath.get(normalizedStoragePath) || machineTypesByStoragePath.get(storagePath);
    if (existingType) {
      objectEntry.props.machineTypeId = existingType[this.columns.machineTypeId];
      return existingType[this.columns.machineTypeId];
    }

    const payload = {
      [this.columns.machineTypeName]: objectEntry.name,
      [this.columns.machineTypeModelPath]: normalizedStoragePath || storagePath,
    };

    const { data, error } = await client
      .from(this.tables.machineTypes)
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new Error('Het type van deze machine kon niet worden opgeslagen.');
    }

    machineTypesByStoragePath.set(storagePath, data);
    if (normalizedStoragePath) {
      machineTypesByStoragePath.set(normalizedStoragePath, data);
    }
    objectEntry.props.machineTypeId = data[this.columns.machineTypeId];
    return data[this.columns.machineTypeId];
  },

  // Create a new machine type entry for a freshly uploaded model.
  // This writes the machine type first, then stores the optional external links in the child table.
  async createMachineTypeWithLinks({ name, storagePath, links = [] }) {
    const client = await this._ensureClient();
    const trimmedName = String(name || '').trim();
    const normalizedStoragePath = this._normalizeStoragePath(storagePath);
    const cleanedLinks = [0, 1, 2].map(index => {
      const value = Array.isArray(links) ? links[index] : '';
      const trimmedValue = String(value || '').trim();
      return trimmedValue || null;
    });

    if (!trimmedName) {
      throw new Error('Vul een naam voor de machine in.');
    }

    if (!normalizedStoragePath) {
      throw new Error('Er ontbreekt een modelbestand voor deze machine.');
    }

    const machineTypePayload = {
      [this.columns.machineTypeName]: trimmedName,
      [this.columns.machineTypeModelPath]: normalizedStoragePath,
    };

    const { data: machineTypeRow, error: machineTypeError } = await client
      .from(this.tables.machineTypes)
      .insert(machineTypePayload)
      .select('*')
      .single();

    if (machineTypeError) {
      throw new Error('De machine kon niet worden opgeslagen.');
    }

    const linkPayload = {
      [this.columns.machineTypeLinkOne]: cleanedLinks[0],
      [this.columns.machineTypeLinkTwo]: cleanedLinks[1],
      [this.columns.machineTypeLinkThree]: cleanedLinks[2],
      [this.columns.machineTypeLinkMachineTypeForeignKey]: machineTypeRow[this.columns.machineTypeId],
    };

    const { data: linkRow, error: linkError } = await client
      .from(this.tables.machineTypeLinks)
      .insert(linkPayload)
      .select('*')
      .single();

    if (linkError) {
      await client
        .from(this.tables.machineTypes)
        .delete()
        .eq(this.columns.machineTypeId, machineTypeRow[this.columns.machineTypeId]);

      throw new Error('De links van de machine konden niet worden opgeslagen.');
    }

    return {
      machineType: machineTypeRow,
      machineTypeLink: linkRow,
    };
  },

  // Delete a machine type and all its related data:
  // 1. machine_type_links rows (foreign key on machine_type_id)
  // 2. machine_types row
  // 3. GLB file from storage
  async deleteMachineType({ id, storagePath }) {
    const client = await this._ensureClient();

    if (!id) {
      throw new Error('Geen machine-id opgegeven voor het verwijderen.');
    }

    console.log('[DB] deleteMachineType gestart', { id, storagePath });

    // Stap 1: verwijder links-rij
    const { error: deleteLinkError } = await client
      .from(this.tables.machineTypeLinks)
      .delete()
      .eq(this.columns.machineTypeLinkMachineTypeForeignKey, id);

    if (deleteLinkError) {
      console.error('[DB] machine_type_links verwijderen mislukt:', deleteLinkError);
      throw new Error('De links van de machine konden niet worden verwijderd.');
    }

    console.log('[DB] Stap 1 OK: links verwijderd');

    // Stap 2: verwijder machine_types rij
    const { error: deleteMachineError } = await client
      .from(this.tables.machineTypes)
      .delete()
      .eq(this.columns.machineTypeId, id);

    if (deleteMachineError) {
      console.error('[DB] machine_types verwijderen mislukt:', deleteMachineError);
      throw new Error('De machine kon niet worden verwijderd.');
    }

    console.log('[DB] Stap 2 OK: machine_types rij verwijderd');

    // Stap 3: verwijder GLB bestand uit storage
    if (storagePath && W3D.Supabase && W3D.Supabase.config && W3D.Supabase.config.bucket) {
      const normalizedPath = this._normalizeStoragePath(storagePath);
      if (normalizedPath) {
        const { error: removeError } = await client.storage
          .from(W3D.Supabase.config.bucket)
          .remove([normalizedPath]);

        if (removeError) {
          console.error('[DB] Storage bestand verwijderen mislukt:', removeError);
        } else {
          console.log('[DB] Stap 3 OK: GLB bestand verwijderd uit storage:', normalizedPath);
        }
      }
    }

    console.log('[DB] deleteMachineType volledig geslaagd voor id', id);
  },

  // Update an existing machine type's name, links, and optionally replace its 3D model file.
  // If newFile is provided, the new file is uploaded first, then the DB row is updated,
  // and finally the old file is removed from storage.
  // If any step fails after a new file was uploaded, that file is cleaned up (rollback).
  async updateMachineTypeWithLinks({ id, name, oldStoragePath, newFile = null, links = [] }) {
    const client = await this._ensureClient();
    const trimmedName = String(name || '').trim();
    const cleanedLinks = [0, 1, 2].map(index => {
      const value = Array.isArray(links) ? links[index] : '';
      return String(value || '').trim() || null;
    });

    console.log('[DB] updateMachineTypeWithLinks gestart', {
      id,
      name: trimmedName,
      oldStoragePath,
      newFile: newFile ? newFile.name : null,
      links: cleanedLinks,
    });

    if (!trimmedName) {
      throw new Error('Vul een naam voor de machine in.');
    }

    if (!id) {
      console.error('[DB] Fout: geen machine_types id meegegeven. Controleer of _editingMachineTypeId correct wordt gezet bij het openen van het bewerkvenster.');
      throw new Error('Geen machine-id opgegeven voor het bijwerken.');
    }

    let newStoragePath = null;
    let hasUploadedNewFile = false;

    try {
      // ── Stap 1: upload nieuw GLB als dat gekozen is ────────────────────────
      if (newFile) {
        if (!/\.(glb|gltf)$/i.test(newFile.name || '')) {
          throw new Error('Gebruik een .glb- of .gltf-bestand.');
        }

        if (!W3D.Supabase || !W3D.Supabase.config || !W3D.Supabase.config.bucket) {
          throw new Error('De opslag is op dit moment niet beschikbaar.');
        }

        newStoragePath = W3D.Supabase._buildStoragePath(newFile.name);
        console.log('[DB] Stap 1: nieuw model uploaden naar storage pad:', newStoragePath);

        const { error: uploadError } = await client.storage
          .from(W3D.Supabase.config.bucket)
          .upload(newStoragePath, newFile, {
            upsert: false,
            contentType: newFile.type || 'model/gltf-binary',
          });

        if (uploadError) {
          console.error('[DB] Upload mislukt:', uploadError);
          throw new Error('Het modelbestand kon niet worden geüpload. Probeer het opnieuw.');
        }

        hasUploadedNewFile = true;
        console.log('[DB] Stap 1 OK: model geüpload naar', newStoragePath);
      } else {
        console.log('[DB] Stap 1 overgeslagen: geen nieuw modelbestand gekozen');
      }

      // ── Stap 2: update naam (en model-pad) in machine_types ───────────────
      const machineTypeUpdate = { [this.columns.machineTypeName]: trimmedName };
      if (newStoragePath) {
        machineTypeUpdate[this.columns.machineTypeModelPath] = newStoragePath;
      }

      console.log(`[DB] Stap 2: UPDATE machine_types SET`, machineTypeUpdate, `WHERE id =`, id, '(type:', typeof id, ')');

      const { data: updatedRows, error: updateError } = await client
        .from(this.tables.machineTypes)
        .update(machineTypeUpdate)
        .eq(this.columns.machineTypeId, id)
        .select();

      if (updateError) {
        console.error('[DB] machine_types update mislukt:', updateError);
        throw new Error('De machine kon niet worden bijgewerkt.');
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error('[DB] machine_types update: query geslaagd maar 0 rijen gewijzigd. Mogelijke oorzaken: RLS policy staat UPDATE niet toe, of id komt niet overeen. id =', id, 'type:', typeof id);
        throw new Error('De naam van de machine kon niet worden bijgewerkt. Controleer of je de juiste rechten hebt (RLS policy).');
      }

      console.log('[DB] Stap 2 OK: machine_types bijgewerkt', updatedRows[0]);

      // ── Stap 3: update links in machine_type_links WHERE machine_type_id = id ─
      const linkFields = {
        [this.columns.machineTypeLinkOne]: cleanedLinks[0],
        [this.columns.machineTypeLinkTwo]: cleanedLinks[1],
        [this.columns.machineTypeLinkThree]: cleanedLinks[2],
      };

      console.log(`[DB] Stap 3: UPDATE machine_type_links SET`, linkFields, `WHERE machine_type_id =`, id);

      const { data: updatedLinks, error: updateLinkError } = await client
        .from(this.tables.machineTypeLinks)
        .update(linkFields)
        .eq(this.columns.machineTypeLinkMachineTypeForeignKey, id)
        .select();

      if (updateLinkError) {
        console.error('[DB] machine_type_links update mislukt:', updateLinkError);
        throw new Error('De links van de machine konden niet worden bijgewerkt.');
      }

      if (!updatedLinks || updatedLinks.length === 0) {
        console.warn('[DB] Stap 3: geen bestaande links-rij gevonden, nieuwe rij aanmaken');
        const { error: insertLinkError } = await client
          .from(this.tables.machineTypeLinks)
          .insert({ ...linkFields, [this.columns.machineTypeLinkMachineTypeForeignKey]: id });

        if (insertLinkError) {
          console.error('[DB] machine_type_links insert mislukt:', insertLinkError);
          throw new Error('De links van de machine konden niet worden opgeslagen.');
        }
        console.log('[DB] Stap 3 OK: nieuwe links-rij aangemaakt');
      } else {
        console.log('[DB] Stap 3 OK: links bijgewerkt', updatedLinks[0]);
      }

      // ── Stap 5: verwijder oud bestand uit storage ──────────────────────────
      if (newStoragePath && oldStoragePath) {
        const normalizedOld = this._normalizeStoragePath(oldStoragePath);
        console.log('[DB] Stap 5: oud model verwijderen', {
          oldStoragePath,
          normalizedOld,
          bucket: W3D.Supabase.config.bucket,
        });

        if (!normalizedOld) {
          console.warn('[DB] Stap 5: pad is leeg na normalisatie, verwijderen overgeslagen. Origineel pad:', oldStoragePath);
        } else {
          const { error: removeError } = await client.storage
            .from(W3D.Supabase.config.bucket)
            .remove([normalizedOld]);

          if (removeError) {
            console.error('[DB] Stap 5 MISLUKT: oud modelbestand kon niet worden verwijderd. Pad:', normalizedOld, 'Fout:', removeError);
          } else {
            console.log('[DB] Stap 5 OK: oud model verwijderd:', normalizedOld);
          }
        }
      } else {
        console.log('[DB] Stap 5 overgeslagen', { newStoragePath, oldStoragePath });
      }

      console.log('[DB] updateMachineTypeWithLinks volledig geslaagd voor id', id);
    } catch (error) {
      if (hasUploadedNewFile && newStoragePath) {
        console.warn('[DB] Fout opgetreden na upload — nieuw bestand wordt opgeruimd:', newStoragePath);
        await client.storage
          .from(W3D.Supabase.config.bucket)
          .remove([newStoragePath])
          .catch(cleanupErr => console.warn('[DB] Rollback upload mislukt:', cleanupErr));
      }
      throw error;
    }
  },

  // Upload the model file and create the related database rows as one save flow.
  // If any later step fails, we clean up the uploaded file so storage does not drift away from the database.
  async createMachineTypeWithFile({ name, file, links = [] }) {
    const client = await this._ensureClient();
    const trimmedName = String(name || '').trim();
    const modelFile = file || null;
    let uploadedStoragePath = '';
    let hasUploadedFile = false;

    if (!trimmedName) {
      throw new Error('Vul een naam voor de machine in.');
    }

    if (!modelFile) {
      throw new Error('Kies een 3D-modelbestand.');
    }

    if (!/\.(glb|gltf)$/i.test(modelFile.name || '')) {
      throw new Error('Gebruik een .glb- of .gltf-bestand.');
    }

    if (!W3D.Supabase || !W3D.Supabase.config || !W3D.Supabase.config.bucket) {
      throw new Error('De opslag is op dit moment niet beschikbaar.');
    }

    try {
      uploadedStoragePath = W3D.Supabase._buildStoragePath(modelFile.name);

      const { error: uploadError } = await client.storage
        .from(W3D.Supabase.config.bucket)
        .upload(uploadedStoragePath, modelFile, {
          upsert: false,
          contentType: modelFile.type || 'model/gltf-binary',
        });

      if (uploadError) {
        const uploadMessage = String(uploadError.message || 'Unknown upload error.');
        if (/networkerror|failed to fetch|fetch resource/i.test(uploadMessage)) {
          throw new Error('Het modelbestand kon niet worden geüpload. Controleer je verbinding en probeer het opnieuw.');
        }

        throw new Error('Het modelbestand kon niet worden geüpload. Probeer het opnieuw.');
      }

      hasUploadedFile = true;

      const createdRows = await this.createMachineTypeWithLinks({
        name: trimmedName,
        storagePath: uploadedStoragePath,
        links,
      });

      return {
        ...createdRows,
        storagePath: uploadedStoragePath,
      };
    } catch (error) {
      if (hasUploadedFile && uploadedStoragePath) {
        const { error: cleanupError } = await client.storage
          .from(W3D.Supabase.config.bucket)
          .remove([uploadedStoragePath]);

        if (cleanupError) {
          console.warn('Could not clean up uploaded model after failed save:', cleanupError);
        }
      }

      throw error;
    }
  },

  // Convert one canvas object into a database row.
  // Note the axis mapping:
  // - Three.js X -> machines.positionX
  // - Three.js Z -> machines.positionY
  // - Three.js rotation.y -> machines.rotationZ
  _buildMachineRow(objectEntry, machineTypeId) {
    return {
      [this.columns.machinePositionX]: Number(objectEntry.mesh.position.x.toFixed(4)),
      [this.columns.machinePositionZ]: Number(objectEntry.mesh.position.z.toFixed(4)),
      [this.columns.machineRotationY]: Number(objectEntry.mesh.rotation.y.toFixed(6)),
      [this.columns.machineTypeForeignKey]: machineTypeId,
    };
  },

  // Save the current scene state into the database.
  // Strategy used here:
  // 1. Read or create machine types.
  // 2. Delete all rows from machines.
  // 3. Insert one fresh row per model currently in the canvas.
  // This matches the mental model of the editor: the canvas is the source of truth.
  async saveScenePlacements() {
    let client;

    try {
      client = await this._ensureClient();
      const machineObjects = this._getPersistableObjects();

      this.setControlsDisabled(true);
      this.setStatus('Machineposities worden opgeslagen...', false, { autoHideMs: 0 });

      const machineTypesByStoragePath = await this._fetchMachineTypesByStoragePath(client);
      const rowsToInsert = [];

      for (const objectEntry of machineObjects) {
        const machineTypeId = await this._ensureMachineType(client, machineTypesByStoragePath, objectEntry);
        rowsToInsert.push(this._buildMachineRow(objectEntry, machineTypeId));
      }

      const { error: deleteError } = await client
        .from(this.tables.machines)
        .delete()
        .not(this.columns.machineId, 'is', null);

      if (deleteError) {
        throw new Error('De bestaande machineposities konden niet worden vernieuwd.');
      }

      let insertedRows = [];
      if (rowsToInsert.length > 0) {
        const { data, error: insertError } = await client
          .from(this.tables.machines)
          .insert(rowsToInsert)
          .select('*');

        if (insertError) {
          throw new Error('De machineposities konden niet worden opgeslagen.');
        }

        insertedRows = data || [];
      }

      // Write database IDs back into the scene objects so future features can reuse them.
      insertedRows.forEach((row, index) => {
        const objectEntry = machineObjects[index];
        if (!objectEntry || !objectEntry.props) return;
        objectEntry.props.machineId = row[this.columns.machineId] || null;
        objectEntry.props.createdFromDatabase = true;
      });

      this.clearSceneDirty();
      this.setStatus(`${rowsToInsert.length} ${this._machineLabel(rowsToInsert.length)} opgeslagen.`);
      this._hasLoadedPlacements = true;
    } catch (error) {
      console.error('Database save error:', error);
      this.setStatus(error.message || 'De machineposities konden niet worden opgeslagen.', true);
    } finally {
      // Re-enable the button when the admin page is allowed to save.
      this.setControlsDisabled(false);
    }
  },

  // Restore all machine rows into the scene.
  // We guard this with a promise so repeated calls do not duplicate the same models.
  async loadSavedMachinesIntoScene(forceReload = false) {
    if (this._loadingPlacementsPromise) {
      return this._loadingPlacementsPromise;
    }

    if (this._hasLoadedPlacements && !forceReload) {
      return;
    }

    this._loadingPlacementsPromise = this._loadSavedMachinesIntoSceneInternal(forceReload);

    try {
      await this._loadingPlacementsPromise;
    } finally {
      this._loadingPlacementsPromise = null;
    }
  },

  // Internal restore implementation.
  async _loadSavedMachinesIntoSceneInternal(forceReload) {
    try {
      const client = await this._ensureClient();

      // When we explicitly reload, first clear only the objects that came from the database.
      // This avoids duplicates while keeping manually loaded-but-unsaved models untouched.
      if (forceReload) {
        W3D.objects
          .filter(obj => obj && obj.props && obj.props.createdFromDatabase)
          .slice()
          .forEach(obj => {
            if (W3D.Transform && W3D.Transform.selected === obj) {
              W3D.Transform.deselect();
            }
            W3D.removeObject(obj);
          });
      }

      const { data: machineTypeRows, error: machineTypeError } = await client
        .from(this.tables.machineTypes)
        .select('*');

      if (machineTypeError) {
        throw new Error('De machinegegevens konden niet worden opgehaald.');
      }

      const machineTypeLinksByMachineTypeId = await this._fetchMachineTypeLinksByMachineTypeId(client);

      const machineTypesById = new Map();
      (machineTypeRows || []).forEach(row => {
        machineTypesById.set(row[this.columns.machineTypeId], row);
      });

      const { data: machineRows, error: machineError } = await client
        .from(this.tables.machines)
        .select('*')
        .order(this.columns.machineId, { ascending: true });

      if (machineError) {
        throw new Error('De opgeslagen machineposities konden niet worden opgehaald.');
      }

      if (!machineRows || machineRows.length === 0) {
        this._hasLoadedPlacements = true;
        this.clearSceneDirty();
        if (W3D.History) {
          W3D.History.clear();
        }
        this.setStatus('Er zijn nog geen opgeslagen machineposities gevonden.');
        return;
      }

      // We weten nu hoeveel machines er zijn → vertel de preloader het totaal bij.
      // De preloader telt dan: 3 lokale + N Supabase = totaal.
      if (W3D.Preloader) W3D.Preloader.addToTotal(machineRows.length);

      let loadedCount = 0;
      let skippedCount = 0;

      for (const machineRow of machineRows) {
        const machineTypeId = this._readRowValue(
          machineRow,
          this.columns.machineTypeForeignKey,
          this.readColumns.machineTypeForeignKey
        );
        const machineTypeRow = machineTypesById.get(machineTypeId);
        const machineTypeLinkRow = machineTypeLinksByMachineTypeId.get(machineTypeId) || null;

        if (!machineTypeRow) {
          console.warn('Skipping machine row because machine type is missing:', machineRow);
          continue;
        }

        const modelReference = machineTypeRow[this.columns.machineTypeModelPath];
        if (!modelReference) {
          console.warn('Skipping machine type because model path is missing:', machineTypeRow);
          skippedCount += 1;
          continue;
        }

        const modelCandidates = await this._buildModelUrlCandidates(modelReference);
        let loaded = false;
        let lastLoadError = null;

        for (const candidateUrl of modelCandidates.urls) {
          try {
            await W3D.Factory.loadRemoteGLTF(
              candidateUrl,
              machineTypeRow[this.columns.machineTypeName] || 'Saved Machine',
              {
                storagePath: modelCandidates.normalizedPath || this._normalizeStoragePath(modelReference),
                machineId: machineRow[this.columns.machineId] || null,
                machineTypeId: machineTypeRow[this.columns.machineTypeId] || null,
                machineTypeLinkId: machineTypeLinkRow ? machineTypeLinkRow[this.columns.machineTypeLinkId] || null : null,
                link1: machineTypeLinkRow ? machineTypeLinkRow[this.columns.machineTypeLinkOne] || null : null,
                link2: machineTypeLinkRow ? machineTypeLinkRow[this.columns.machineTypeLinkTwo] || null : null,
                link3: machineTypeLinkRow ? machineTypeLinkRow[this.columns.machineTypeLinkThree] || null : null,
                courseLink: machineTypeLinkRow ? machineTypeLinkRow[this.columns.machineTypeLinkOne] || null : null,
                maintenanceLink: machineTypeLinkRow ? machineTypeLinkRow[this.columns.machineTypeLinkTwo] || null : null,
                safetyLink: machineTypeLinkRow ? machineTypeLinkRow[this.columns.machineTypeLinkThree] || null : null,
                positionX: this._toNumber(
                  this._readRowValue(machineRow, this.columns.machinePositionX, this.readColumns.machinePositionX)
                ),
                positionZ: this._toNumber(
                  this._readRowValue(machineRow, this.columns.machinePositionZ, this.readColumns.machinePositionZ)
                ),
                rotationY: this._toNumber(
                  this._readRowValue(machineRow, this.columns.machineRotationY, this.readColumns.machineRotationY)
                ),
                createdFromDatabase: true,
              }
            );

            loaded = true;
            loadedCount += 1;
            // Model geladen → meld aan preloader zodat de balk verder schuift.
            if (W3D.Preloader) W3D.Preloader.increment();
            break;
          } catch (loadError) {
            lastLoadError = loadError;
            console.warn('Model load attempt failed, trying next candidate URL:', {
              machineId: machineRow[this.columns.machineId] || null,
              machineTypeId: machineTypeRow[this.columns.machineTypeId] || null,
              modelReference,
              candidateUrl,
              error: loadError,
            });
          }
        }

        if (!loaded) {
          skippedCount += 1;
          // Model mislukt → toch increment zodat de balk niet vastloopt.
          if (W3D.Preloader) W3D.Preloader.increment();
          console.warn('Skipping machine because model could not be loaded from any candidate URL:', {
            machineRow,
            machineTypeRow,
            modelReference,
            lastLoadError,
          });
        }
      }

      this._hasLoadedPlacements = true;
      this.clearSceneDirty();
      if (W3D.History) {
        W3D.History.clear();
      }
      if (skippedCount > 0) {
        this.setStatus(`${loadedCount} opgeslagen ${this._machineLabel(loadedCount)} geladen. ${skippedCount} ${skippedCount === 1 ? 'kon' : 'konden'} niet worden getoond.`, true);
      } else {
        this.setStatus(`${loadedCount} opgeslagen ${this._machineLabel(loadedCount)} geladen.`);
      }
    } catch (error) {
      console.error('Database load error:', error);
      this.setStatus(error.message || 'De opgeslagen machineposities konden niet worden geladen.', true);
    }
  },
};