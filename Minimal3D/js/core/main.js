/* Application entry point - This starts the app when the page loads */
W3D.init = function() {
  W3D.initRenderer(); // Set up the 3D scene, camera, lights, etc.
  // Load a local 3D model (replace 'models/your-model.glb' with your file path)
  W3D.Factory.loadLocalGLTF('models/plattegrond.glb'); // Path relative to the HTML file
};

// Start the app
W3D.init();