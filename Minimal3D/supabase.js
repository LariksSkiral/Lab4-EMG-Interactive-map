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

		// Toggle error class for red text style.
		this.ui.status.classList.toggle('error', Boolean(isError));
	},

	// Enable or disable the storage action buttons.
	// This prevents users from clicking upload before Supabase is ready.
	setControlsDisabled(isDisabled) {
		if (this.ui.uploadButton) this.ui.uploadButton.disabled = isDisabled;
		if (this.ui.refreshButton) this.ui.refreshButton.disabled = isDisabled;
		if (this.ui.loadButton) this.ui.loadButton.disabled = isDisabled;
		if (this.ui.fileSelect) this.ui.fileSelect.disabled = isDisabled;
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

		// Dropdown that shows uploaded files.
		this.ui.fileSelect = document.getElementById('sb-file-select');

		// Button to load selected uploaded model into Three.js scene.
		this.ui.loadButton = document.getElementById('sb-load-btn');

		// Status line for success/error messages.
		this.ui.status = document.getElementById('sb-status');

		// Lock controls at first.
		// We only unlock them after Supabase is connected.
		this.setControlsDisabled(true);
		this.setStatus('Preparing Supabase connection...');

		// Connect buttons to actions (click handlers).
		if (this.ui.uploadButton) {
			this.ui.uploadButton.addEventListener('click', () => {
				// Run upload flow when upload button is clicked.
				this.uploadSelectedFile();
			});
		}

		if (this.ui.refreshButton) {
			this.ui.refreshButton.addEventListener('click', () => {
				// Refresh list from Supabase Storage.
				this.listFilesAndPopulateDropdown();
			});
		}

		if (this.ui.loadButton) {
			this.ui.loadButton.addEventListener('click', () => {
				// Load chosen uploaded model into scene.
				this.loadSelectedFileIntoScene();
			});
		}
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

	// Upload the currently selected file from the file input.
	async uploadSelectedFile() {
		// Guard: cannot upload if client is not initialized yet.
		if (!this.client) {
			this.setStatus(this.lastInitError || 'Supabase is still connecting. Wait a moment and try again.', true);
			return;
		}

		// Read first selected file from <input type="file">.
		const file = this.ui.fileInput && this.ui.fileInput.files ? this.ui.fileInput.files[0] : null;

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
		const { error } = await this.client.storage
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
			return;
		}

		// Upload succeeded.
		this.setStatus(`Upload complete: ${file.name}. Refreshing files from ${this._getFolderLabel()}...`);

		// Refresh dropdown so newly uploaded file appears immediately.
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
			return;
		}

		// Keep only 3D model files we care about.
		const glbFiles = (data || []).filter(item => /\.(glb|gltf)$/i.test(item.name || ''));

		// Guard: if dropdown missing, we cannot render list.
		if (!this.ui.fileSelect) return;

		// Clear old dropdown options before adding new ones.
		this.ui.fileSelect.innerHTML = '';

		// If no model files exist yet, show helpful placeholder option.
		if (glbFiles.length === 0) {
			// Create one <option> as friendly empty state.
			const option = document.createElement('option');
			option.value = '';
			option.textContent = 'No uploaded .glb files found';
			this.ui.fileSelect.appendChild(option);
			this.setStatus(`Connected, but no .glb files were found in ${this._getFolderLabel()}.`);
			return;
		}

		// Add one dropdown option per uploaded model file.
		glbFiles.forEach(item => {
			// Build full path expected by getPublicUrl later.
			const filePath = folder ? `${folder}/${item.name}` : item.name;

			// Create and configure <option> element.
			const option = document.createElement('option');
			option.value = filePath;
			option.textContent = item.name;

			// Add option to dropdown.
			this.ui.fileSelect.appendChild(option);
		});

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

		// Ask Supabase to build a public link for selected file path.
		const { data } = this.client.storage.from(this.config.bucket).getPublicUrl(filePath);

		// Extract URL safely.
		const publicUrl = data && data.publicUrl ? data.publicUrl : '';

		// Guard: URL build failed.
		if (!publicUrl) {
			this.setStatus('Could not build public URL for selected file.', true);
			return;
		}

		// Friendly model name from path tail.
		const fileName = filePath.split('/').pop() || 'Supabase Model';

		// Show status so user knows loading started.
		this.setStatus(`Loading ${fileName} into the scene...`);

		// Use existing Three.js factory method to load model from URL.
		W3D.Factory.loadRemoteGLTF(publicUrl, fileName);
	},
};
