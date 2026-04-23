/* This file sets up the 3D world in our app. It creates the scene, camera, lights, and grid, and handles drawing everything on screen. We need this to make the 3D graphics work. Without it, there would be no 3D view. For beginners: This is like setting up a movie set with cameras, lights, and props so we can film and show the 3D scene. */
/* Three.js scene setup, camera, lighting, animation loop - This sets up the 3D world */
W3D.initRenderer = function () {
  // Get the canvas element from HTML where we'll draw
  const canvas = document.getElementById("three-canvas");

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
  W3D.camera = new THREE.PerspectiveCamera(
    58,
    window.innerWidth / window.innerHeight,
    0.05,
    800,
  );
  W3D.camera.position.set(12, 10, 16);
  W3D.camera.lookAt(0, 0, 0);

  // ── Orthographic camera (top / 2D view) ──────────────────────────────────
  const aspect = window.innerWidth / window.innerHeight;
  const orthoHalf = 20; // half-height in scene units at default zoom
  W3D.cameraTop = new THREE.OrthographicCamera(
    -orthoHalf * aspect,
    orthoHalf * aspect,
    orthoHalf,
    -orthoHalf,
    0.1,
    1000,
  );
  W3D.cameraTop.position.set(0, 200, 0);
  W3D.cameraTop.lookAt(0, 0, 0);
  W3D.cameraTop.up.set(0, 0, -1); // so "up" on screen = -Z in world

  // Active camera – starts in 3D, toggled by view switcher
  W3D.activeCamera = W3D.camera;
  W3D.viewMode = "3d"; // '3d' | 'top'

  // ── Smooth camera focus state ────────────────────────────────────────────
  W3D.cameraFocus = {
    active: false,
    speed: 0.08, // lager = rustiger, hoger = sneller
    targetPosition: new THREE.Vector3(),
    targetLookAt: new THREE.Vector3(),
    topZoom: null,
  };

  // ── View-switching helper ─────────────────────────────────────────────────
  W3D.setViewMode = function (mode) {
    W3D.viewMode = mode;
    if (mode === "top") {
      W3D.activeCamera = W3D.cameraTop;
      W3D.scene.fog = null;
      W3D.orbitControls.object = W3D.cameraTop;
      // Top-view controls: pan only, no rotation
      W3D.orbitControls.enableRotate = false;
      W3D.orbitControls.enablePan = true;
      W3D.orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      W3D.orbitControls.target.set(
        W3D.orbitControls.target.x,
        0,
        W3D.orbitControls.target.z,
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
        RIGHT: THREE.MOUSE.PAN,
      };
    }
    W3D.orbitControls.update();
    // Also update the TransformControls camera so gizmos stay correct
    if (W3D.Transform && W3D.Transform.controls) {
      W3D.Transform.controls.camera = W3D.activeCamera;
    }
  };

  // Orbit controls
  W3D.orbitControls = new THREE.OrbitControls(
    W3D.activeCamera,
    W3D.renderer.domElement,
  );
  W3D.orbitControls.enableDamping = true;
  W3D.orbitControls.dampingFactor = 0.08;
  W3D.orbitControls.target.set(0, 0, 0);
  W3D.orbitControls.update();

  // Basic lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  W3D.scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(10, 16, 8);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  W3D.scene.add(dirLight);

  // Grid
  W3D.gridHelper = new THREE.GridHelper(80, 80, 0xd7d2cb, 0xe8e3db);
  W3D.scene.add(W3D.gridHelper);

  // Resize handling
  window.addEventListener("resize", () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspectNow = width / height;

    W3D.camera.aspect = aspectNow;
    W3D.camera.updateProjectionMatrix();

    W3D.cameraTop.left = -orthoHalf * aspectNow;
    W3D.cameraTop.right = orthoHalf * aspectNow;
    W3D.cameraTop.top = orthoHalf;
    W3D.cameraTop.bottom = -orthoHalf;
    W3D.cameraTop.updateProjectionMatrix();

    W3D.renderer.setSize(width, height);
  });

  W3D.renderer.setSize(window.innerWidth, window.innerHeight);

  // Animation loop
  const animate = () => {
    requestAnimationFrame(animate);

    // Smooth focus animation
    if (W3D.cameraFocus && W3D.cameraFocus.active) {
      const focus = W3D.cameraFocus;
      const cam = W3D.viewMode === "top" ? W3D.cameraTop : W3D.camera;

      cam.position.lerp(focus.targetPosition, focus.speed);
      W3D.orbitControls.target.lerp(focus.targetLookAt, focus.speed);

      if (W3D.viewMode === "top" && typeof focus.topZoom === "number") {
        cam.zoom = THREE.MathUtils.lerp(cam.zoom, focus.topZoom, focus.speed);
        cam.updateProjectionMatrix();
      }

      const posDone = cam.position.distanceTo(focus.targetPosition) < 0.05;
      const targetDone =
        W3D.orbitControls.target.distanceTo(focus.targetLookAt) < 0.05;
      const zoomDone =
        W3D.viewMode !== "top" || typeof focus.topZoom !== "number"
          ? true
          : Math.abs(cam.zoom - focus.topZoom) < 0.01;

      if (posDone && targetDone && zoomDone) {
        cam.position.copy(focus.targetPosition);
        W3D.orbitControls.target.copy(focus.targetLookAt);

        if (W3D.viewMode === "top" && typeof focus.topZoom === "number") {
          cam.zoom = focus.topZoom;
          cam.updateProjectionMatrix();
        }

        focus.active = false;
      }
    }

    W3D.orbitControls.update();
    W3D.renderer.render(W3D.scene, W3D.activeCamera);
  };

  animate();
};

// ── Camera focus helper ─────────────────────────────────────────────
W3D.focusCameraOnObject = function (objectEntry) {
  if (!objectEntry || !objectEntry.mesh) return;

  const mesh = objectEntry.mesh;
  const box = new THREE.Box3().setFromObject(mesh);
  if (box.isEmpty()) return;

  const center = new THREE.Vector3();
  box.getCenter(center);

  const size = new THREE.Vector3();
  box.getSize(size);

  if (!W3D.cameraFocus) {
    W3D.cameraFocus = {
      active: false,
      speed: 0.08,
      targetPosition: new THREE.Vector3(),
      targetLookAt: new THREE.Vector3(),
      topZoom: null,
    };
  }

  W3D.cameraFocus.targetLookAt.copy(center);
  W3D.cameraFocus.topZoom = null;

  // 3D view
  if (W3D.viewMode === "3d") {
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const distance = Math.max(4, maxDim * 2.8);
    const direction = new THREE.Vector3(1, 0.65, 1).normalize();

    const desiredPosition = center
      .clone()
      .add(direction.multiplyScalar(distance));
    W3D.cameraFocus.targetPosition.copy(desiredPosition);
    W3D.cameraFocus.active = true;
    return;
  }

  // Top view
  if (W3D.viewMode === "top") {
    const desiredHeight = W3D.cameraTop.position.y;
    W3D.cameraFocus.targetPosition.set(center.x, desiredHeight, center.z);

    const maxDim = Math.max(size.x, size.z, 1);
    const desiredZoom = THREE.MathUtils.clamp(24 / (maxDim + 6), 0.8, 2.4);
    W3D.cameraFocus.topZoom = desiredZoom;
    W3D.cameraFocus.active = true;
  }
};
