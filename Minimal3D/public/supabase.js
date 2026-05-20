/*
	This file handles all Supabase-related actions for beginners:
	1) Connect to Supabase using values from .env
	2) Upload .glb files to a Storage bucket
	3) List uploaded files
	4) Load a selected file back into the 3D scene
*/

// We attach Supabase logic to the existing global W3D object,
// so the rest of the project can call it as W3D.Supabase.
W3D.Supabase = {
	// Holds the Supabase client after we connect.
	client: null,

	// Tracks whether Supabase finished setup successfully.
	ready: false,

	// Stores the last initialization error message so we can show a precise reason later.
	lastInitError: '',

	// Holds a file dropped onto the drop zone (fallback when DataTransfer assignment isn't supported).
	_droppedFile: null,

	// Holds cleaned config values so we can reuse them in multiple functions.
	config: {
		url: '',
		anonKey: '',
		bucket: '',
		folder: '',
	},

	// Cache UI elements so we do not repeatedly search the DOM.
	ui: {
		fileInput: null,
		uploadButton: null,
		refreshButton: null,
		fileSelect: null,
		loadButton: null,
		status: null,
	},

	// Read an environment value and clean it.
	// Why this is needed:
	// - In development, Vite replaces placeholders like %VITE_SUPABASE_URL%.
	// - If replacement did not happen, we should treat that as "not configured".
	_cleanEnvValue(value) {
		// If value is empty/undefined/null, return an empty string.
		if (!value) return '';

		// Convert to text and remove accidental spaces at start/end.
		const trimmed = String(value).trim();

		// If placeholder text is still visible, Vite did not inject env values.
		// Example bad value: "%VITE_SUPABASE_URL%"
		if (trimmed.includes('%VITE_')) return '';

		// Safe, cleaned env value.
		return trimmed;
	},

	// Create a safe upload path inside the bucket.
	// Example result with folder: glb-files/1711800000000-my_model.glb
	// Example result without folder: 1711800000000-my_model.glb
	// Why include Date.now(): avoids filename collisions when uploading same name twice.
	_buildStoragePath(fileName) {
		// Replace special characters so path is always storage-safe.
		const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

		// Use configured folder exactly as provided.
		// If folder is empty, file goes into bucket root.
		const folder = this.config.folder || '';

		// If folder exists, put file in folder; otherwise store in bucket root.
		return folder ? `${folder}/${Date.now()}-${safeName}` : `${Date.now()}-${safeName}`;
	},

	// Convert the current folder setting into a friendly label for status messages.
	_getFolderLabel() {
		return this.config.folder ? `map "${this.config.folder}"` : 'de hoofdmap';
	},

	_friendlyStorageError(error, fallbackMessage) {
		const rawMessage = String((error && error.message) || '').toLowerCase();

		if (!rawMessage) return fallbackMessage;
		if (rawMessage.includes('network') || rawMessage.includes('fetch')) {
			return 'Er kon geen verbinding worden gemaakt met de opslag. Probeer het opnieuw.';
		}
		if (rawMessage.includes('permission') || rawMessage.includes('not authorized') || rawMessage.includes('unauthorized')) {
			return 'Je hebt geen toegang tot deze actie. Log opnieuw in en probeer het nog eens.';
		}
		if (rawMessage.includes('bucket')) {
			return 'De opslag is op dit moment niet beschikbaar.';
		}

		return fallbackMessage;
	},

	_normalizeStoragePath(pathValue) {
		if (!pathValue) return '';

		if (W3D.Database && typeof W3D.Database._normalizeStoragePath === 'function') {
			return W3D.Database._normalizeStoragePath(pathValue);
		}

		return String(pathValue).trim().replace(/^\/+/, '');
	},

	_getFileNameFromPath(pathValue) {
		const normalizedPath = this._normalizeStoragePath(pathValue);
		if (!normalizedPath) return '';
		const pathParts = normalizedPath.split('/').filter(Boolean);
		return pathParts.length ? pathParts[pathParts.length - 1] : normalizedPath;
	},

	async _fetchMachineTypeNamesByStoragePath() {
		if (!this.client) return new Map();

		const { data, error } = await this.client
			.from('machine_types')
			.select('name, model, category_id');

		if (error) {
			console.warn('Machine type names could not be loaded for the model library:', error);
			return new Map();
		}

		// Returns Map<storagePath, { name, categoryId }>
		const dataByStoragePath = new Map();
		(data || []).forEach(row => {
			const storagePath = row && row.model ? String(row.model).trim() : '';
			const machineName = row && row.name ? String(row.name).trim() : '';
			const categoryId = row && row.category_id != null ? row.category_id : null;
			const fileName = this._getFileNameFromPath(storagePath);

			if (!storagePath || !machineName) return;

			const entry = { name: machineName, categoryId };
			dataByStoragePath.set(storagePath, entry);

			const normalizedPath = this._normalizeStoragePath(storagePath);
			if (normalizedPath) dataByStoragePath.set(normalizedPath, entry);
			if (fileName) dataByStoragePath.set(fileName, entry);
		});

		return dataByStoragePath;
	},

	// Show a human-friendly message in the UI panel.
	// isError=true will color the status text red.
	setStatus(message, isError = false) {
		// If status element does not exist, silently skip.
		if (!this.ui.status) return;

		// Write text for user feedback.
		this.ui.status.textContent = message;

		// Toggle error styling class (is-error gives red background in new CSS).
		this.ui.status.classList.toggle('is-error', Boolean(isError));
		this.ui.status.classList.toggle('is-ok', !isError && Boolean(message));
	},

	// Enable or disable the storage action buttons.
	// This prevents users from clicking upload before Supabase is ready.
	setControlsDisabled(isDisabled) {
		// Refresh and load buttons follow the overall connection state.
		if (this.ui.refreshButton) this.ui.refreshButton.disabled = isDisabled;
		if (this.ui.loadButton) this.ui.loadButton.disabled = isDisabled;
		if (this.ui.fileSelect) this.ui.fileSelect.disabled = isDisabled;

		// Upload button: always disabled when not connected.
		// When connected, only enable it if a file has already been selected.
		if (isDisabled) {
			if (this.ui.uploadButton) this.ui.uploadButton.disabled = true;
		} else {
			const hasFile = this.ui.fileInput &&
							this.ui.fileInput.files &&
							this.ui.fileInput.files.length > 0;
			if (this.ui.uploadButton) this.ui.uploadButton.disabled = !hasFile;
		}
	},

	// Find and store all HTML elements used for upload/load controls.
	// Doing this once makes code cleaner and slightly faster.
	setupUI() {
		// File picker where user chooses a local .glb/.gltf file.
		this.ui.fileInput = document.getElementById('sb-file-input');

		// Button to upload selected file.
		this.ui.uploadButton = document.getElementById('sb-upload-btn');

		// Button to re-fetch storage file list.
		this.ui.refreshButton = document.getElementById('sb-refresh-btn');

		// Hidden select kept for loadSelectedFileIntoScene() to read the chosen path.
		this.ui.fileSelect = document.getElementById('sb-file-select');

		// Button to load selected uploaded model into Three.js scene.
		this.ui.loadButton = document.getElementById('sb-load-btn');

		// Status line for success/error messages.
		this.ui.status = document.getElementById('sb-status');

		// Lock controls at first.
		// We only unlock them after Supabase is connected.
		this.setControlsDisabled(true);
		this.setStatus('Verbinding met de opslag voorbereiden...');

		// ── File selection via file input change ──────────────────────────────
		if (this.ui.fileInput) {
			this.ui.fileInput.addEventListener('change', () => {
				// Show preview and enable upload button when a file is chosen.
				this._handleFileSelected();
			});
		}

		// ── Drag-and-drop onto the drop zone ────────────────────────────────
		const dropZone = document.getElementById('drop-zone');
		if (dropZone) {
			// Required to allow drop events.
			dropZone.addEventListener('dragover', (e) => {
				e.preventDefault();
				dropZone.classList.add('is-drag-over');
			});
			// Remove hover style when drag leaves the zone.
			dropZone.addEventListener('dragleave', () => {
				dropZone.classList.remove('is-drag-over');
			});
			// Handle the actual file drop.
			dropZone.addEventListener('drop', (e) => {
				e.preventDefault();
				dropZone.classList.remove('is-drag-over');
				const file = e.dataTransfer && e.dataTransfer.files[0];
				if (file && this.ui.fileInput) {
					// Transfer dropped file into the real file input.
					try {
						const dt = new DataTransfer();
						dt.items.add(file);
						this.ui.fileInput.files = dt.files;
					} catch (dtErr) {
						// DataTransfer not supported in this browser; store file directly.
						this._droppedFile = file;
					}
					this._handleFileSelected(file);
				}
			});
		}

		// ── Clear selected file ──────────────────────────────────────────────
		const clearBtn = document.getElementById('file-preview-clear');
		if (clearBtn) {
			clearBtn.addEventListener('click', (e) => {
				e.preventDefault();
				this._clearSelectedFile();
			});
		}

		// ── Button actions ───────────────────────────────────────────────────
		if (this.ui.uploadButton) {
			this.ui.uploadButton.addEventListener('click', () => {
				this.uploadSelectedFile();
			});
		}

		if (this.ui.refreshButton) {
			this.ui.refreshButton.addEventListener('click', () => {
				this.listFilesAndPopulateDropdown();
			});
		}

		if (this.ui.loadButton) {
			this.ui.loadButton.addEventListener('click', () => {
				this.loadSelectedFileIntoScene();
			});
		}
	},

	// Called whenever a file is picked (via input or drag-drop).
	// Stores the file reference and updates the UI preview strip.
	_handleFileSelected(explicitFile) {
		// Use the passed file (from drag-drop) or read from the file input.
		const file = explicitFile ||
			(this.ui.fileInput && this.ui.fileInput.files && this.ui.fileInput.files[0]);

		const dropZone = document.getElementById('drop-zone');
		const preview = document.getElementById('file-preview');
		const previewName = document.getElementById('file-preview-name');
		const previewSize = document.getElementById('file-preview-size');

		if (file) {
			// Populate preview strip.
			if (previewName) previewName.textContent = file.name;
			if (previewSize) previewSize.textContent = this._formatFileSize(file.size);
			if (preview) preview.classList.remove('is-hidden');
			if (dropZone) dropZone.classList.add('has-file');

			// Enable upload button only if Supabase is connected.
			if (this.ui.uploadButton) this.ui.uploadButton.disabled = !this.ready;
		} else {
			this._clearSelectedFile();
		}
	},

	// Reset file selection and hide the preview strip.
	_clearSelectedFile() {
		if (this.ui.fileInput) this.ui.fileInput.value = '';
		this._droppedFile = null;

		const preview = document.getElementById('file-preview');
		const dropZone = document.getElementById('drop-zone');
		if (preview) preview.classList.add('is-hidden');
		if (dropZone) dropZone.classList.remove('has-file');

		// Upload button should stay disabled until a new file is chosen.
		if (this.ui.uploadButton) this.ui.uploadButton.disabled = true;
	},

	// Convert bytes to a human-readable size string (e.g. '1.4 MB').
	_formatFileSize(bytes) {
		if (!bytes || bytes < 1024) return (bytes || 0) + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	},

	// Read config from window.APP_CONFIG (which is filled from .env by Vite).
	async initializeFromConfig() {
		// Reset previous state before trying again.
		this.client = null;
		this.ready = false;
		this.lastInitError = '';
		this.setControlsDisabled(true);

		// Get app config object from window, or empty object if missing.
		const appConfig = window.APP_CONFIG || {};

		// Read and clean each env-config value.
		this.config.url = this._cleanEnvValue(appConfig.SUPABASE_URL);
			// This browser app can use either a legacy anon key or the newer publishable key.
			// In both cases, createClient is called the same way.
		this.config.anonKey = this._cleanEnvValue(appConfig.SUPABASE_ANON_KEY);
		this.config.bucket = this._cleanEnvValue(appConfig.SUPABASE_BUCKET);
		// Leave folder empty when not provided.
		// Empty means: upload to the root of the bucket.
		this.config.folder = this._cleanEnvValue(appConfig.SUPABASE_FOLDER);

		// These 3 values are required to connect and use Storage.
		if (!this.config.url || !this.config.anonKey || !this.config.bucket) {
			this.lastInitError = 'De opslag voor deze omgeving is nog niet volledig ingesteld. Neem contact op met de beheerder.';
			// Give clear beginner-friendly setup message.
			this.setStatus(this.lastInitError, true);
			// Stop here until config is fixed.
			return;
		}

		// The Supabase library exposes createClient via the global "supabase" object.
		if (!window.supabase || !window.supabase.createClient) {
			this.lastInitError = 'De opslagservice kon niet worden geladen. Controleer je verbinding en probeer het opnieuw.';
			// This means CDN script did not load or loaded incorrectly.
			this.setStatus(this.lastInitError, true);
			return;
		}

		// Create a client connected to your project URL and browser-safe API key.
		// Supabase accepts the legacy anon key and the newer publishable key here.
		this.client = window.supabase.createClient(this.config.url, this.config.anonKey);
		this.ready = true;
		this.lastInitError = '';
		this.setControlsDisabled(false);

		// Let user know connection worked.
		this.setStatus(`Opslag verbonden. Modellen worden opgehaald uit ${this._getFolderLabel()}...`);

		// Immediately fetch files so dropdown is ready.
		await this.listFilesAndPopulateDropdown();
	},

	// Subscribe to auth state changes (SIGNED_IN, SIGNED_OUT, etc.).
	onAuthStateChange(callback) {
		if (!this.client) {
			this.lastInitError = 'De inlogservice is op dit moment niet beschikbaar.';
			console.error('Supabase auth listener error:', this.lastInitError);
			return null;
		}

		const { data } = this.client.auth.onAuthStateChange((event, session) => {
			if (typeof callback === 'function') {
				callback(event, session);
			}
		});

		return data;
	},

	// Upload the currently selected file from the file input.
	async uploadSelectedFile() {
		// Guard: cannot upload if client is not initialized yet.
		if (!this.client) {
			this.setStatus(this.lastInitError || 'De opslag wordt nog verbonden. Probeer het zo opnieuw.', true);
			return;
		}

		// Read first selected file — could be from the input or dragged in.
		const file = (this.ui.fileInput && this.ui.fileInput.files && this.ui.fileInput.files[0])
			|| this._droppedFile
			|| null;

		// Guard: no file selected.
		if (!file) {
			this.setStatus('Kies eerst een .glb- of .gltf-bestand.', true);
			return;
		}

		// Only allow .glb or .gltf names for this project flow.
		const isModelFile = /\.(glb|gltf)$/i.test(file.name);
		if (!isModelFile) {
			this.setStatus('Alleen .glb- en .gltf-bestanden kunnen hier worden gebruikt.', true);
			return;
		}

		// Build final path where file will live in bucket.
		const storagePath = this._buildStoragePath(file.name);

		// Show upload-in-progress message.
		this.setStatus(`${file.name} wordt geüpload naar ${this._getFolderLabel()}...`);

		// Send file to Supabase Storage bucket.
		const { data, error } = await this.client.storage
			// Pick bucket from config.
			.from(this.config.bucket)
			// Upload file bytes to generated path.
			.upload(storagePath, file, {
				// upsert=false means: do not overwrite if same path exists.
				upsert: false,
				// Provide content type so browser/tools understand file type.
				contentType: file.type || 'model/gltf-binary',
			});

		// If Supabase returns an error, show it in UI.
		if (error) {
			this.setStatus(this._friendlyStorageError(error, 'Het uploaden van het bestand is niet gelukt.'), true);
			console.error('Supabase upload error:', error);
			return;
		}

		if (!data) {
			console.error('Supabase upload error: empty response data.');
		}

		// Upload succeeded — clear the file selection so it's ready for the next upload.
		this._clearSelectedFile();
		this.setStatus(`${file.name} is geüpload. De modellenlijst wordt vernieuwd...`);

		// Refresh list so newly uploaded file appears immediately in the library.
		await this.listFilesAndPopulateDropdown();
	},

	// Load list of files from Supabase bucket and show them in the dropdown, grouped by zone.
	async listFilesAndPopulateDropdown() {
		if (!this.client) {
			this.setStatus(this.lastInitError || 'De opslag is op dit moment niet beschikbaar.', true);
			return;
		}

		const folder = this.config.folder || '';

		const { data, error } = await this.client.storage
			.from(this.config.bucket)
			.list(folder, { limit: 100, sortBy: { column: 'name', order: 'asc' } });

		if (error) {
			this.setStatus(this._friendlyStorageError(error, 'De modellenlijst kon niet worden opgehaald.'), true);
			console.error('Supabase list error:', error);
			return;
		}

		const glbFiles = (data || []).filter(item => /\.(glb|gltf)$/i.test(item.name || ''));
		const machineDataByPath = await this._fetchMachineTypeNamesByStoragePath();

		const getMachineData = (item) => {
			const filePath = folder ? `${folder}/${item.name}` : item.name;
			const normalizedPath = this._normalizeStoragePath(filePath);
			const fileName = this._getFileNameFromPath(filePath);
			return machineDataByPath.get(filePath)
				|| machineDataByPath.get(normalizedPath)
				|| machineDataByPath.get(item.name)
				|| machineDataByPath.get(fileName)
				|| null;
		};

		// ── Update hidden <select> ─────────────────────────────────────────────
		if (this.ui.fileSelect) {
			this.ui.fileSelect.innerHTML = '';
			glbFiles.forEach(item => {
				const filePath = folder ? `${folder}/${item.name}` : item.name;
				const machineData = getMachineData(item);
				const option = document.createElement('option');
				option.value = filePath;
				option.textContent = machineData ? machineData.name : item.name;
				this.ui.fileSelect.appendChild(option);
			});
		}

		// ── Update visible file library list ──────────────────────────────────
		const fileList = document.getElementById('sb-file-list');
		if (!fileList) return;

		fileList.innerHTML = '';

		if (glbFiles.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'sb-file-empty';
			empty.textContent = 'Nog geen modellen beschikbaar';
			fileList.appendChild(empty);
			this.setStatus(`Er zijn nog geen 3D-modellen gevonden in ${this._getFolderLabel()}.`);
			return;
		}

		// ── Zone definitions ──────────────────────────────────────────────────
		const CATEGORY_NAMES = {
			1: 'Verspanningszone',
			2: '(De)montagezone',
			3: 'Lasplaats',
			4: 'CNC zone',
			5: 'Magazijn',
			6: 'Reinigingzone',
			7: 'Overige',
		};
		// Zone 7 (Overige) also catches models with no category assigned
		const CATEGORY_ORDER = [1, 2, 3, 4, 5, 6, 7];

		// ── Group files by category ───────────────────────────────────────────
		// null and 7 both map to the "Overige" bucket (key = 7)
		const groups = new Map();
		glbFiles.forEach(item => {
			const filePath = folder ? `${folder}/${item.name}` : item.name;
			const machineData = getMachineData(item);
			const displayName = machineData ? machineData.name : item.name;
			const rawCategoryId = machineData ? machineData.categoryId : null;
			const categoryId = (rawCategoryId === null || rawCategoryId === undefined) ? 7 : rawCategoryId;

			if (!groups.has(categoryId)) groups.set(categoryId, []);
			groups.get(categoryId).push({ item, filePath, displayName });
		});

		const renderOrder = CATEGORY_ORDER.filter(id => groups.has(id));

		// ── Helper: build one sb-file-item div ────────────────────────────────
		const buildFileItem = (filePath, displayName) => {
			const div = document.createElement('div');
			div.className = 'sb-file-item';
			div.dataset.filePath = filePath;
			div.innerHTML =
				`<span class="sb-file-item-icon">◈</span>` +
				`<span class="sb-file-item-name">${displayName}</span>` +
				`<button class="sb-file-edit-btn" type="button" title="Bewerken" tabindex="0">` +
				`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>` +
				`</button>` +
				`<button class="sb-file-delete-btn" type="button" title="Verwijderen" tabindex="0">` +
				`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>` +
				`</button>`;

			// Edit button
			const editBtn = div.querySelector('.sb-file-edit-btn');
			if (editBtn) {
				editBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					const editData = { id: null, name: displayName, storagePath: filePath, link1: '', link2: '', link3: '', categoryId: null };

					if (this.client) {
						try {
							const normalizedPath = this._normalizeStoragePath(filePath);
							let { data: row } = await this.client
								.from('machine_types')
								.select('id, name, model, category_id, machine_type_links(*)')
								.eq('model', filePath)
								.maybeSingle();

							if (!row && normalizedPath && normalizedPath !== filePath) {
								({ data: row } = await this.client
									.from('machine_types')
									.select('id, name, model, category_id, machine_type_links(*)')
									.eq('model', normalizedPath)
									.maybeSingle());
							}

							if (row) {
								const linkRow = Array.isArray(row.machine_type_links) ? row.machine_type_links[0] : row.machine_type_links || null;
								editData.id = row.id;
								editData.name = row.name || displayName;
								editData.categoryId = row.category_id || null;
								editData.link1 = linkRow ? (linkRow.course_url || '') : '';
								editData.link2 = linkRow ? (linkRow.maintenance_url || '') : '';
								editData.link3 = linkRow ? (linkRow.safety_url || '') : '';
								console.log('[supabase] Pencil fetch OK — category_id:', row.category_id, '| editData:', editData);
							} else {
								console.warn('[supabase] Pencil fetch: geen rij gevonden voor pad:', filePath);
							}
						} catch (fetchErr) {
							console.warn('Machine type gegevens konden niet worden opgehaald:', fetchErr);
						}
					}

					if (typeof W3D.openOverlayForEdit === 'function') W3D.openOverlayForEdit(editData);
				});
			}

			// Delete button
			const deleteBtn = div.querySelector('.sb-file-delete-btn');
			if (deleteBtn) {
				deleteBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					const confirmed = await W3D.dialog.confirm(
						`"${displayName}" verwijderen?`,
						'Dit verwijdert het 3D-model uit de opslag en alle bijhorende gegevens uit de database.'
					);
					if (!confirmed) return;

					deleteBtn.disabled = true;
					try {
						let machineTypeId = null;
						if (this.client) {
							const normalizedPath = this._normalizeStoragePath(filePath);
							let { data: row } = await this.client.from('machine_types').select('id').eq('model', filePath).maybeSingle();
							if (!row && normalizedPath && normalizedPath !== filePath) {
								({ data: row } = await this.client.from('machine_types').select('id').eq('model', normalizedPath).maybeSingle());
							}
							machineTypeId = row ? row.id : null;
						}
						if (!machineTypeId) throw new Error('Machine type niet gevonden in de database.');
						await W3D.Database.deleteMachineType({ id: machineTypeId, storagePath: filePath });
						await this.listFilesAndPopulateDropdown();
					} catch (err) {
						console.error('Verwijderen mislukt:', err);
						W3D.dialog.alert('Verwijderen mislukt', err.message);
						deleteBtn.disabled = false;
					}
				});
			}

			// Select on click
			div.addEventListener('click', () => {
				fileList.querySelectorAll('.sb-file-item').forEach(el => el.classList.remove('is-selected'));
				div.classList.add('is-selected');
				if (this.ui.fileSelect) this.ui.fileSelect.value = filePath;
				if (this.ui.loadButton) this.ui.loadButton.disabled = false;
			});

			return div;
		};

		// ── Render zone sections — each zone gets its own titled file list ────
		renderOrder.forEach(categoryId => {
			const items = groups.get(categoryId);
			const zoneName = categoryId !== null ? (CATEGORY_NAMES[categoryId] || `Zone ${categoryId}`) : 'Geen zone';

			const section = document.createElement('div');
			section.className = 'sb-zone-section';

			const title = document.createElement('span');
			title.className = 'sb-zone-title';
			title.textContent = zoneName;
			section.appendChild(title);

			const list = document.createElement('div');
			list.className = 'sb-file-list';
			items.forEach(({ filePath, displayName }) => {
				list.appendChild(buildFileItem(filePath, displayName));
			});
			section.appendChild(list);

			fileList.appendChild(section);
		});

		this.setStatus(`${glbFiles.length} model${glbFiles.length === 1 ? '' : 'len'} beschikbaar in ${this._getFolderLabel()}.`);
	},

	// Build a public URL and send the selected model to the 3D loader.
	async loadSelectedFileIntoScene() {
		// Guard: need active Supabase connection.
		if (!this.client) {
			this.setStatus(this.lastInitError || 'De opslag is op dit moment niet beschikbaar.', true);
			return;
		}

		// Read selected storage path from dropdown.
		const filePath = this.ui.fileSelect ? this.ui.fileSelect.value : '';

		// Guard: nothing selected.
		if (!filePath) {
			this.setStatus('Kies eerst een model uit de lijst.', true);
			return;
		}

		// Build a URL that works for both private and public buckets.
		// Private buckets need signed URLs; public buckets can use public URLs.
		const storageRef = this.client.storage.from(this.config.bucket);
		let modelUrl = '';

		const { data: signedData, error: signedError } = await storageRef.createSignedUrl(filePath, 60 * 60);
		if (!signedError && signedData && signedData.signedUrl) {
			modelUrl = signedData.signedUrl;
		}

		if (!modelUrl) {
			const { data: publicData } = storageRef.getPublicUrl(filePath);
			modelUrl = publicData && publicData.publicUrl ? publicData.publicUrl : '';
		}

		if (!modelUrl) {
			this.setStatus(this._friendlyStorageError(signedError, 'Het geselecteerde model kon niet worden voorbereid.'), true);
			console.error('Supabase URL build error:', signedError);
			return;
		}

		// Friendly model name from path tail.
		const fileName = filePath.split('/').pop() || 'Model';

		// Show status so user knows loading started.
		this.setStatus(`${fileName} wordt in de ruimte geladen...`);

		// Use existing Three.js factory method to load model from URL.
		try {
			const obj = await W3D.Factory.loadRemoteGLTF(modelUrl, fileName, { storagePath: filePath });
			if (obj && W3D.focusCameraOnObject) W3D.focusCameraOnObject(obj);
			this.setStatus(`${fileName} staat nu in de ruimte. Zet het op de juiste plek en klik daarna op Opslaan.`);
		} catch (loadError) {
			console.error('Supabase model load error:', loadError);
			this.setStatus(`${fileName} kon niet worden geladen. Probeer het opnieuw.`, true);
		}
	},
};
