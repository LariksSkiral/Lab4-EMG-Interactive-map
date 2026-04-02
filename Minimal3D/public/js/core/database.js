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
  - machines.model       (foreign key to machine_types.id)

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
    machineTypeForeignKey: 'model',

    machineTypeId: 'id',
    machineTypeName: 'name',
    machineTypeModelPath: 'model',
    machineTypeLinkForeignKey: 'link',
  },

  // Fallback read keys help when a table already exists with a slightly different column name.
  // Example: the user message contained "postion X" with a typo, so we support that during reads.
  readColumns: {
    machinePositionX: ['positionX', 'postion X', 'position_x'],
    machinePositionZ: ['positionY', 'positionZ', 'position_y', 'position_z'],
    machineRotationY: ['rotationZ', 'rotationY', 'rotation_y', 'rotation_z'],
    machineTypeForeignKey: ['model', 'machine_type', 'machineTypeId'],
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
    if (this.ui.saveButton) {
      this.ui.saveButton.disabled = Boolean(isDisabled);
    }
  },

  // Show status in both the admin topbar and the uploader drawer.
  // Reusing one message keeps feedback consistent no matter which panel is visible.
  setStatus(message, isError = false) {
    if (this.ui.status) {
      this.ui.status.textContent = message || '';
      this.ui.status.classList.toggle('is-error', Boolean(isError));
      this.ui.status.classList.toggle('is-ok', !isError && Boolean(message));
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
    if (!this.ui.unsavedAlert) return;
    this.ui.unsavedAlert.classList.toggle('is-hidden', !this._hasUnsavedChanges);
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

    throw new Error((W3D.Supabase && W3D.Supabase.lastInitError) || 'Supabase client is not ready.');
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
      throw new Error('Supabase storage bucket is not configured.');
    }

    const storageRef = client.storage.from(bucket);

    const { data: signedData, error: signedError } = await storageRef.createSignedUrl(storagePath, 60 * 60);
    if (!signedError && signedData && signedData.signedUrl) {
      return signedData.signedUrl;
    }

    const { data: publicData } = storageRef.getPublicUrl(storagePath);
    if (publicData && publicData.publicUrl) {
      return publicData.publicUrl;
    }

    throw new Error((signedError && signedError.message) || `Could not create a storage URL for ${storagePath}.`);
  },

  // Read all machine types and index them by storage path.
  // We use storage path as the lookup key because that tells us which 3D file each type represents.
  async _fetchMachineTypesByStoragePath(client) {
    const { data, error } = await client
      .from(this.tables.machineTypes)
      .select('*');

    if (error) {
      throw new Error(`Could not read machine types: ${error.message}`);
    }

    const machineTypesByStoragePath = new Map();
    (data || []).forEach(row => {
      const storagePath = row[this.columns.machineTypeModelPath];
      if (storagePath) {
        machineTypesByStoragePath.set(storagePath, row);
      }
    });

    return machineTypesByStoragePath;
  },

  // Make sure a machine type exists for a loaded model.
  // If the type is missing, we create it automatically so Save keeps working for new models.
  async _ensureMachineType(client, machineTypesByStoragePath, objectEntry) {
    const storagePath = objectEntry && objectEntry.props ? objectEntry.props.storagePath : '';
    if (!storagePath) {
      throw new Error(`Object "${objectEntry && objectEntry.name ? objectEntry.name : 'unknown'}" has no storage path.`);
    }

    const existingType = machineTypesByStoragePath.get(storagePath);
    if (existingType) {
      objectEntry.props.machineTypeId = existingType[this.columns.machineTypeId];
      objectEntry.props.machineTypeLinkId = existingType[this.columns.machineTypeLinkForeignKey] || null;
      return existingType[this.columns.machineTypeId];
    }

    const payload = {
      [this.columns.machineTypeName]: objectEntry.name,
      [this.columns.machineTypeModelPath]: storagePath,
    };

    const { data, error } = await client
      .from(this.tables.machineTypes)
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Could not create machine type for ${objectEntry.name}: ${error.message}`);
    }

    machineTypesByStoragePath.set(storagePath, data);
    objectEntry.props.machineTypeId = data[this.columns.machineTypeId];
    objectEntry.props.machineTypeLinkId = data[this.columns.machineTypeLinkForeignKey] || null;
    return data[this.columns.machineTypeId];
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
      this.setStatus('Saving current machine placements...');

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
        throw new Error(`Could not clear old machine placements: ${deleteError.message}`);
      }

      let insertedRows = [];
      if (rowsToInsert.length > 0) {
        const { data, error: insertError } = await client
          .from(this.tables.machines)
          .insert(rowsToInsert)
          .select('*');

        if (insertError) {
          throw new Error(`Could not save machine placements: ${insertError.message}`);
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

      const noun = rowsToInsert.length === 1 ? 'machine' : 'machines';
      this.clearSceneDirty();
      this.setStatus(`Saved ${rowsToInsert.length} ${noun} to the database.`);
      this._hasLoadedPlacements = true;
    } catch (error) {
      console.error('Database save error:', error);
      this.setStatus(error.message || 'Could not save machine placements.', true);
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
        throw new Error(`Could not read machine types: ${machineTypeError.message}`);
      }

      const machineTypesById = new Map();
      (machineTypeRows || []).forEach(row => {
        machineTypesById.set(row[this.columns.machineTypeId], row);
      });

      const { data: machineRows, error: machineError } = await client
        .from(this.tables.machines)
        .select('*')
        .order(this.columns.machineId, { ascending: true });

      if (machineError) {
        throw new Error(`Could not read saved machines: ${machineError.message}`);
      }

      if (!machineRows || machineRows.length === 0) {
        this._hasLoadedPlacements = true;
        this.clearSceneDirty();
        this.setStatus('No saved machines were found in the database.');
        return;
      }

      let loadedCount = 0;

      for (const machineRow of machineRows) {
        const machineTypeId = this._readRowValue(
          machineRow,
          this.columns.machineTypeForeignKey,
          this.readColumns.machineTypeForeignKey
        );
        const machineTypeRow = machineTypesById.get(machineTypeId);

        if (!machineTypeRow) {
          console.warn('Skipping machine row because machine type is missing:', machineRow);
          continue;
        }

        const storagePath = machineTypeRow[this.columns.machineTypeModelPath];
        if (!storagePath) {
          console.warn('Skipping machine type because model path is missing:', machineTypeRow);
          continue;
        }

        const modelUrl = await this._buildModelUrl(storagePath);
        await W3D.Factory.loadRemoteGLTF(
          modelUrl,
          machineTypeRow[this.columns.machineTypeName] || 'Saved Machine',
          {
            storagePath,
            machineId: machineRow[this.columns.machineId] || null,
            machineTypeId: machineTypeRow[this.columns.machineTypeId] || null,
            machineTypeLinkId: machineTypeRow[this.columns.machineTypeLinkForeignKey] || null,
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

        loadedCount += 1;
      }

      this._hasLoadedPlacements = true;
      this.clearSceneDirty();
      this.setStatus(`Loaded ${loadedCount} saved machine placements.`);
    } catch (error) {
      console.error('Database load error:', error);
      this.setStatus(error.message || 'Could not restore saved machines.', true);
    }
  },
};