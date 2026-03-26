/* Three.js scene setup, camera, lighting, animation loop - This sets up the 3D world */
W3D.initRenderer = function() {
  // Get the canvas element from HTML where we'll draw
  const canvas = document.getElementById('three-canvas');

  // Create the WebGL renderer (draws 3D graphics)
  W3D.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Make it look sharp on high-DPI screens
  W3D.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Enable shadows for realistic lighting
  W3D.renderer.shadowMap.enabled = true;
  W3D.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Set background color to white
  W3D.renderer.setClearColor(0xffffff);

  // Create the 3D scene (container for all objects)
  W3D.scene = new THREE.Scene();
  // Add fog for depth (makes distant objects fade)
  W3D.scene.fog = new THREE.FogExp2(0xffffff, 0.006);

  // Create a camera (perspective view, like human eyes)
  W3D.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 800);
  // Position the camera in 3D space
  W3D.camera.position.set(12, 10, 16);
  // Point camera at the center
  W3D.camera.lookAt(0, 0, 0);

  // Add mouse controls to orbit the camera around the scene
  W3D.orbitControls = new THREE.OrbitControls(W3D.camera, W3D.renderer.domElement);
  W3D.orbitControls.enableDamping = true; // Smooth movement
  W3D.orbitControls.dampingFactor = 0.07;
  W3D.orbitControls.maxPolarAngle = Math.PI / 1.9; // Limit vertical rotation
  W3D.orbitControls.minDistance = 0.5; // Min zoom
  W3D.orbitControls.maxDistance = 200; // Max zoom

  // Lighting setup
  // Ambient light (soft, everywhere)
  const ambient = new THREE.AmbientLight(0x8090a8, 0.5);
  W3D.scene.add(ambient);

  // Directional light (sun-like, with shadows)
  const sun = new THREE.DirectionalLight(0xfff8f0, 0.85);
  sun.position.set(16, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); // Shadow quality
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  W3D.scene.add(sun);

  // Hemisphere light (sky-like fill)
  const fill = new THREE.HemisphereLight(0x6688cc, 0x442200, 0.35);
  W3D.scene.add(fill);

  // Add a grid on the ground for reference
  const gridHelper = new THREE.GridHelper(100, 100, 0x2a2e38, 0x1e2230);
  W3D.scene.add(gridHelper);

  // Handle window resize to keep canvas full-screen
  function onResize() {
    W3D.renderer.setSize(window.innerWidth, window.innerHeight);
    W3D.camera.aspect = window.innerWidth / window.innerHeight;
    W3D.camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  onResize();

  // Animation loop - runs every frame to update and draw
  (function animate() {
    requestAnimationFrame(animate); // Call this function again next frame
    W3D.orbitControls.update(); // Update camera controls

    // Render (draw) the scene with the camera
    W3D.renderer.render(W3D.scene, W3D.camera);
  })();
};