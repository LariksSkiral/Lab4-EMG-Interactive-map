/* This file holds the global state (data) for our 3D app. It stores important things like the scene, camera, and objects. We need this to keep track of everything in the app, so different parts can share and update the data. Without it, the app wouldn't know what to draw or control. For beginners: Think of this as a shared notebook where all parts of the app write and read notes to work together. */
/* Minimal global state - This object holds all the important variables for our 3D app */
const W3D = {
  // The 3D scene where we place objects (like a stage)
  scene: null,
  // The camera that views the scene (like your eyes)
  camera: null,
  // The renderer that draws the scene on the screen
  renderer: null,
  // Controls for moving the camera with mouse (orbit around the scene)
  orbitControls: null,
  // A clock to track time (used for animations)
  clock: new THREE.Clock(),
  // Array to store all 3D objects in the scene
  objects: [],
  // Function to generate unique IDs for objects
  genId: function() { return 'obj_' + Math.random().toString(36).slice(2, 7); }
};