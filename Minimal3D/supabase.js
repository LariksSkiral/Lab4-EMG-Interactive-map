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
		return this.config.folder ? `folder "${this.config.folder}"` : 'bucket root';
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
		this.setStatus('Preparing Supabase connection...');

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
			this.lastInitError = 'Supabase settings are missing in the served page. Make sure you started Minimal3D with npm run dev:minimal3d and then refreshed the browser.';
			// Give clear beginner-friendly setup message.
			this.setStatus(this.lastInitError, true);
			// Stop here until config is fixed.
			return;
		}

		// The Supabase library exposes createClient via the global "supabase" object.
		if (!window.supabase || !window.supabase.createClient) {
			this.lastInitError = 'Supabase browser library did not load. Check your internet connection or CDN blocking.';
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
		this.setStatus(`Supabase connected. Fetching files from ${this._getFolderLabel()}...`);

		// Immediately fetch files so dropdown is ready.
		await this.listFilesAndPopulateDropdown();
	},

	// Subscribe to auth state changes (SIGNED_IN, SIGNED_OUT, etc.).
	onAuthStateChange(callback) {
		if (!this.client) {
			this.lastInitError = 'Supabase client is not ready for auth state listening.';
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
			this.setStatus(this.lastInitError || 'Supabase is still connecting. Wait a moment and try again.', true);
			return;
		}

		// Read first selected file — could be from the input or dragged in.
		const file = (this.ui.fileInput && this.ui.fileInput.files && this.ui.fileInput.files[0])
			|| this._droppedFile
			|| null;

		// Guard: no file selected.
		if (!file) {
			this.setStatus('Please choose a .glb file before uploading.', true);
			return;
		}

		// Only allow .glb or .gltf names for this project flow.
		const isModelFile = /\.(glb|gltf)$/i.test(file.name);
		if (!isModelFile) {
			this.setStatus('Only .glb or .gltf files are allowed for this upload.', true);
			return;
		}

		// Build final path where file will live in bucket.
		const storagePath = this._buildStoragePath(file.name);

		// Show upload-in-progress message.
		this.setStatus(`Uploading ${file.name} to ${this._getFolderLabel()}...`);

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
			this.setStatus(`Upload failed: ${error.message}`, true);
			console.error('Supabase upload error:', error);
			return;
		}

		if (!data) {
			console.error('Supabase upload error: empty response data.');
		}

		// Upload succeeded — clear the file selection so it's ready for the next upload.
		this._clearSelectedFile();
		this.setStatus(`Upload complete: ${file.name}. Refreshing files from ${this._getFolderLabel()}...`);

		// Refresh list so newly uploaded file appears immediately in the library.
		await this.listFilesAndPopulateDropdown();
	},

	// Load list of files from Supabase bucket and show them in the dropdown.
	async listFilesAndPopulateDropdown() {
		// Guard: if not connected, skip silently.
		if (!this.client) {
			this.setStatus(this.lastInitError || 'Supabase is not ready yet.', true);
			return;
		}

		// Folder can be empty string (bucket root) or configured folder path.
		const folder = this.config.folder || '';

		// Ask Supabase for up to 100 files in folder, sorted by name.
		const { data, error } = await this.client.storage
			.from(this.config.bucket)
			.list(folder, {
				limit: 100,
				sortBy: { column: 'name', order: 'asc' },
			});

		// Show user-facing error if listing failed.
		if (error) {
			this.setStatus(`Could not list files: ${error.message}`, true);
			console.error('Supabase list error:', error);
			return;
		}

		// Keep only 3D model files we care about.
		const glbFiles = (data || []).filter(item => /\.(glb|gltf)$/i.test(item.name || ''));

		// ── Update hidden <select> (used by loadSelectedFileIntoScene) ────────
		if (this.ui.fileSelect) {
			this.ui.fileSelect.innerHTML = '';
			glbFiles.forEach(item => {
				const filePath = folder ? `${folder}/${item.name}` : item.name;
				const option = document.createElement('option');
				option.value = filePath;
				option.textContent = item.name;
				this.ui.fileSelect.appendChild(option);
			});
		}

		// ── Update the visible file library list ──────────────────────────────
		const fileList = document.getElementById('sb-file-list');
		if (fileList) {
			fileList.innerHTML = '';

			if (glbFiles.length === 0) {
				// Show friendly empty state.
				const empty = document.createElement('div');
				empty.className = 'sb-file-empty';
				empty.textContent = 'No models uploaded yet';
				fileList.appendChild(empty);
				this.setStatus(`Connected, but no .glb files were found in ${this._getFolderLabel()}.`);
				return;
			}

			// One list item per model file.
			glbFiles.forEach(item => {
				const filePath = folder ? `${folder}/${item.name}` : item.name;

				const div = document.createElement('div');
				div.className = 'sb-file-item';
				div.dataset.filePath = filePath;
				div.innerHTML = `<span class="sb-file-item-icon">◈</span>` +
					`<span class="sb-file-item-name">${item.name}</span>`;

				div.addEventListener('click', () => {
					// Deselect all other items first.
					fileList.querySelectorAll('.sb-file-item')
						.forEach(el => el.classList.remove('is-selected'));
					// Highlight the clicked item.
					div.classList.add('is-selected');
					// Sync the hidden select to the same value so load still works.
					if (this.ui.fileSelect) this.ui.fileSelect.value = filePath;
					// Enable load button now that a model is chosen.
					if (this.ui.loadButton) this.ui.loadButton.disabled = false;
				});

				fileList.appendChild(div);
			});
		}

		// Show count so user knows list is ready.
		this.setStatus(`Ready. Found ${glbFiles.length} model file(s) in ${this._getFolderLabel()}.`);
	},

	// Build a public URL and send the selected model to the 3D loader.
	async loadSelectedFileIntoScene() {
		// Guard: need active Supabase connection.
		if (!this.client) {
			this.setStatus(this.lastInitError || 'Supabase client is not connected yet.', true);
			return;
		}

		// Read selected storage path from dropdown.
		const filePath = this.ui.fileSelect ? this.ui.fileSelect.value : '';

		// Guard: nothing selected.
		if (!filePath) {
			this.setStatus('Choose a file from the dropdown first.', true);
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
			const reason = signedError ? signedError.message : 'Could not build a URL for selected file.';
			this.setStatus(reason, true);
			console.error('Supabase URL build error:', signedError);
			return;
		}

		// Friendly model name from path tail.
		const fileName = filePath.split('/').pop() || 'Supabase Model';

		// Show status so user knows loading started.
		this.setStatus(`Loading ${fileName} into the scene...`);

		// Use existing Three.js factory method to load model from URL.
		W3D.Factory.loadRemoteGLTF(modelUrl, fileName);
	},
};
