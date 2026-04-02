/* This file sets up the 3D world in our app. It creates the scene, camera, lights, and grid, and handles drawing everything on screen. We need this to make the 3D graphics work. Without it, there would be no 3D view. For beginners: This is like setting up a movie set with cameras, lights, and props so we can film and show the 3D scene. */
/* Three.js scene setup, camera, lighting, animation loop - This sets up the 3D world */
W3D.initRenderer = function() {
  // Get the canvas element from HTML where we'll draw
  const canvas = document.getElementById('three-canvas');

  // Create the WebGL renderer (draws 3D graphics)
  W3D.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Make it look sharp on high-DPI screens
  W3D.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Render final colors in sRGB so materials and textures look correct on screen.
  W3D.renderer.outputEncoding = THREE.sRGBEncoding;
  // Tone mapping helps indoor lights feel less flat and more realistic.
  W3D.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  W3D.renderer.toneMappingExposure = 1.08;
  // Enable shadows for realistic lighting
  W3D.renderer.shadowMap.enabled = true;
  W3D.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Set background color to white
  W3D.renderer.setClearColor(0xffffff);

  // Create the 3D scene (container for all objects)
  W3D.scene = new THREE.Scene();
  // Indoor setting: keep atmosphere clean instead of outdoor-like fog.
  W3D.scene.fog = null;

  // ── Perspective camera (3D view) ─────────────────────────────────────────
  W3D.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 800);
  W3D.camera.position.set(12, 10, 16);
  W3D.camera.lookAt(0, 0, 0);

  // ── Orthographic camera (top / 2D view) ──────────────────────────────────
  const aspect = window.innerWidth / window.innerHeight;
  const orthoHalf = 20; // half-height in scene units at default zoom
  W3D.cameraTop = new THREE.OrthographicCamera(
    -orthoHalf * aspect, orthoHalf * aspect,
     orthoHalf, -orthoHalf,
    0.1, 1000
  );
  W3D.cameraTop.position.set(0, 200, 0);
  W3D.cameraTop.lookAt(0, 0, 0);
  W3D.cameraTop.up.set(0, 0, -1); // so "up" on screen = -Z in world

  // Active camera – starts in 3D, toggled by view switcher
  W3D.activeCamera = W3D.camera;
  W3D.viewMode = '3d'; // '3d' | 'top'

  // ── View-switching helper ─────────────────────────────────────────────────
  W3D.setViewMode = function(mode) {
    W3D.viewMode = mode;
    if (mode === 'top') {
      W3D.activeCamera = W3D.cameraTop;
      W3D.scene.fog = null;
      W3D.orbitControls.object = W3D.cameraTop;
      // Top-view controls: pan only, no rotation
      W3D.orbitControls.enableRotate = false;
      W3D.orbitControls.enablePan = true;
      W3D.orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      };
      W3D.orbitControls.target.set(
        W3D.orbitControls.target.x,
        0,
        W3D.orbitControls.target.z
      );
    } else {
      W3D.activeCamera = W3D.camera;
      // Keep 3D mode crisp as an indoor workshop, without outdoor haze.
      W3D.scene.fog = null;
      W3D.orbitControls.object = W3D.camera;
      W3D.orbitControls.enableRotate = true;
      W3D.orbitControls.enablePan = true;
      W3D.orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      };
    }
    W3D.orbitControls.update();
    // Also update the TransformControls camera so gizmos stay correct
    if (W3D.Transform && W3D.Transform.controls) {
      W3D.Transform.controls.camera = W3D.activeCamera;
    }
    // Update topbar button states
    const btn3d  = document.getElementById('btn-view-3d');
    const btnTop = document.getElementById('btn-view-top');
    if (btn3d)  btn3d.classList.toggle('active', mode === '3d');
    if (btnTop) btnTop.classList.toggle('active', mode === 'top');
  };

  // Add mouse controls to orbit/pan the camera
  W3D.orbitControls = new THREE.OrbitControls(W3D.camera, W3D.renderer.domElement);
  W3D.orbitControls.enableDamping = true;
  W3D.orbitControls.dampingFactor = 0.07;
  W3D.orbitControls.minPolarAngle = 0.1;
  W3D.orbitControls.maxPolarAngle = Math.PI / 2.1;
  W3D.orbitControls.minDistance = 0.5;
  W3D.orbitControls.maxDistance = 200;

  const floorY = 0;
  const floorEpsilon = 0.05;

  function clampViewAboveFloor() {
    // Only apply floor clamp in 3D perspective mode
    if (W3D.viewMode !== '3d') return;
    const target = W3D.orbitControls.target;
    const delta = Math.max(
      floorY - target.y,
      floorY + floorEpsilon - W3D.camera.position.y,
      0
    );
    if (delta > 0) {
      target.y += delta;
      W3D.camera.position.y += delta;
    }
  }

  // Lighting setup (indoor mechanic workshop)
  // 1) Very soft base light so shadows never become fully black.
  const ambient = new THREE.AmbientLight(0xf4f6f8, 0.34);
  W3D.scene.add(ambient);

  // 2) Ceiling fixtures: these replace sunlight and sky lighting.
  // We place a simple grid of indoor lights to mimic workshop luminaires.
  const ceilingLights = [
    [-18, 6.5, -18],
    [0, 6.5, -18],
    [18, 6.5, -18],
    [-18, 6.5, 0],
    [0, 6.5, 0],
    [18, 6.5, 0],
    [-18, 6.5, 18],
    [0, 6.5, 18],
    [18, 6.5, 18],
  ];

  ceilingLights.forEach((position, index) => {
    // Slightly cool white typical for workshop LED/fluorescent tubes.
    const fixture = new THREE.PointLight(0xf8fbff, 0.78, 38, 2);
    fixture.position.set(position[0], position[1], position[2]);

    // Only let a few fixtures cast shadows to keep performance smooth.
    const shouldCastShadows = index === 1 || index === 4 || index === 7;
    fixture.castShadow = shouldCastShadows;
    if (shouldCastShadows) {
      fixture.shadow.mapSize.set(2048, 2048);
      // Normal bias is the most important setting to reduce diagonal striping (shadow acne).
      fixture.shadow.normalBias = 0.02;
      fixture.shadow.bias = -0.00002;
      fixture.shadow.camera.near = 0.5;
      fixture.shadow.camera.far = 25;
    }

    W3D.scene.add(fixture);
  });

  // Add a grid on the ground for reference
  // 1 unit = 1 meter (matching Blender scale), each grid block = 0.5 units (0.5m)
  const gridSize = 120; // 120 units = 120 meters
  const gridDivisions = 240; // 240 divisions across 120 units = 0.5 unit per block
  const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x2a2e38, 0x1e2230);
  W3D.scene.add(gridHelper);

  // Handle window resize to keep canvas full-screen
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    W3D.renderer.setSize(w, h);
    // Update perspective camera
    W3D.camera.aspect = w / h;
    W3D.camera.updateProjectionMatrix();
    // Update orthographic camera
    const a = w / h;
    const oh = orthoHalf * (W3D.cameraTop.zoom || 1 );
    W3D.cameraTop.left   = -oh * a;
    W3D.cameraTop.right  =  oh * a;
    W3D.cameraTop.top    =  oh;
    W3D.cameraTop.bottom = -oh;
    W3D.cameraTop.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  onResize();

  // Animation loop - runs every frame to update and draw
  (function animate() {
    requestAnimationFrame(animate);
    W3D.orbitControls.update();
    clampViewAboveFloor();
    W3D.renderer.render(W3D.scene, W3D.activeCamera);
  })();
};