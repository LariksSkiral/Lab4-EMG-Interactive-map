/* This file starts the app when the page loads. It calls the setup functions and loads the 3D model. We need this to kick off everything. Without it, the app wouldn't run. For beginners: This is like the 'start' button that gets everything going when you open the page. */
/* Application entry point - This starts the app when the page loads */
W3D.init = async function() {
  // Step 1: Build the 3D world (camera, lights, grid, renderer).
  W3D.initRenderer(); // Set up the 3D scene, camera, lights, etc.

  // Step 2: Load your default local model so the scene is not empty at start.
  // Load a local 3D model (replace 'models/your-model.glb' with your file path)
  W3D.Factory.loadLocalGLTF('models/plattegrond.glb'); // Path relative to the HTML file

  // Step 3: Initialize Supabase upload/list/load features.
  // Initialize Supabase features if the helper script exists.
  // This wires the upload buttons and reads your .env values (via Vite placeholders).
  if (W3D.Supabase) {
    // Find the upload panel elements and connect button click handlers.
    W3D.Supabase.setupUI();

    // Read .env values, connect to Supabase, and fill the dropdown with uploaded files.
    await W3D.Supabase.initializeFromConfig();
  }
};

// Start the app immediately when this file is loaded by the browser.
W3D.init();