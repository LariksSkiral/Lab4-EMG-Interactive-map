/* ═══════════════════════════════════════════════════════
   js/core/renderer.js
   Three.js scene setup, camera, lighting, resize, animation loop.
═══════════════════════════════════════════════════════ */

W3D.initRenderer = function () {
  const canvas   = document.getElementById('three-canvas');
  const viewport = document.getElementById('viewport');

  /* ── Renderer ── */
  W3D.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  W3D.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  W3D.renderer.shadowMap.enabled = true;
  W3D.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  W3D.renderer.setClearColor(0xf7f5f2);

  /* ── Scene ── */
  W3D.scene = new THREE.Scene();
  W3D.scene.fog = new THREE.FogExp2(0xf7f5f2, 0.005);

  /* ── Camera ── */
  const { width, height } = viewport.getBoundingClientRect();
  W3D.camera = new THREE.PerspectiveCamera(58, width / height, 0.05, 800);
  W3D.camera.position.set(12, 10, 16);
  W3D.camera.lookAt(0, 0, 0);

  /* ── Orbit controls ── */
  W3D.orbitControls = new THREE.OrbitControls(W3D.camera, W3D.renderer.domElement);
  W3D.orbitControls.enableDamping   = true;
  W3D.orbitControls.dampingFactor   = 0.07;
  W3D.orbitControls.maxPolarAngle   = Math.PI / 1.9;
  W3D.orbitControls.minDistance     = 0.5;
  W3D.orbitControls.maxDistance     = 200;

  /* ── Transform controls ── */
  W3D.transformControls = new THREE.TransformControls(W3D.camera, W3D.renderer.domElement);
  W3D.transformControls.addEventListener('dragging-changed', e => {
    W3D.orbitControls.enabled = !e.value;
    // Track drag so the click event fired after mouseUp is suppressed
    if (e.value) {
      W3D._dragActive = true;
    } else {
      // Short window to eat the incoming click
      setTimeout(() => { W3D._dragActive = false; }, 120);
    }
  });
  W3D.transformControls.addEventListener('change', () => {
    if (W3D.selectedObject) W3D.Inspector.sync();
  });
  W3D.transformControls.addEventListener('mouseUp', () => {
    W3D.History.push();
  });
  W3D.scene.add(W3D.transformControls);

  /* ── Lighting ── */
  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  W3D.scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff8f0, 0.6);
  sun.position.set(16, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near   =  0.5;
  sun.shadow.camera.far    = 120;
  sun.shadow.camera.left   = -50;
  sun.shadow.camera.right  =  50;
  sun.shadow.camera.top    =  50;
  sun.shadow.camera.bottom = -50;
  W3D.scene.add(sun);

  const fill = new THREE.HemisphereLight(0xd0e0ff, 0xfff0e0, 0.4);
  W3D.scene.add(fill);

  /* ── Grid ── */
  W3D.gridHelper = new THREE.GridHelper(100, 100, 0xb8b8b8, 0xd8d8d8);
  W3D.scene.add(W3D.gridHelper);

  /* ── Invisible ground plane for raycasting ── */
  const gGeo = new THREE.PlaneGeometry(500, 500);
  const gMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  W3D.groundPlane = new THREE.Mesh(gGeo, gMat);
  W3D.groundPlane.rotation.x = -Math.PI / 2;
  W3D.groundPlane.name = '__ground__';
  W3D.scene.add(W3D.groundPlane);

  /* ── Resize handler ── */
  function onResize () {
    const vp = document.getElementById('viewport');
    const { width: w, height: h } = vp.getBoundingClientRect();
    W3D.renderer.setSize(w, h);
    W3D.camera.aspect = w / h;
    W3D.camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  onResize();

  /* ── Animation loop ── */
  (function animate () {
    requestAnimationFrame(animate);
    W3D.orbitControls.update();

    // Animate info-point sprites
    const t = W3D.clock.getElapsedTime();
    W3D.objects.forEach(obj => {
      if (obj.type !== 'infopoint' || !obj.mesh) return;
      obj.mesh.position.y = (obj.props._baseY ?? 1.2) + Math.sin(t * 2 + (obj._seed || 0)) * 0.09;
      obj.mesh.traverse(child => {
        if (!child.userData.isRing || !child.material) return;
        const s = 1 + 0.35 * Math.abs(Math.sin(t * 2.5 + (obj._seed || 0)));
        child.scale.set(s, s, 1);
        child.material.opacity = 0.35 + 0.3 * Math.abs(Math.sin(t * 2.5));
      });
    });

    W3D.renderer.render(W3D.scene, W3D.camera);

    // Update overlay counters
    document.getElementById('vp-obj-count').textContent = W3D.objects.length + ' objects';
  })();
};

/* ─── Raycast helpers ─────────────────────────── */

W3D.getGroundPoint = function (clientX, clientY) {
  W3D._setMouse(clientX, clientY);
  W3D.raycaster.setFromCamera(W3D.mouse, W3D.camera);
  const hits = W3D.raycaster.intersectObject(W3D.groundPlane);
  if (!hits.length) return null;
  let p = hits[0].point.clone();
  if (W3D.snapEnabled) {
    const s = W3D.snapSize;
    p.x = Math.round(p.x / s) * s;
    p.z = Math.round(p.z / s) * s;
  }
  return p;
};

W3D.getRaycastObject = function (clientX, clientY) {
  W3D._setMouse(clientX, clientY);
  W3D.raycaster.setFromCamera(W3D.mouse, W3D.camera);
  const meshes = W3D.objects.map(o => o.mesh).filter(Boolean);
  const hits   = W3D.raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;

  // Walk up to find registered object
  let node = hits[0].object;
  for (let i = 0; i < 6; i++) {
    const found = W3D.objects.find(o => o.mesh === node);
    if (found) return found;
    if (!node.parent || node.parent === W3D.scene) break;
    node = node.parent;
  }
  return null;
};

W3D._setMouse = function (clientX, clientY) {
  const canvas = document.getElementById('three-canvas');
  const rect   = canvas.getBoundingClientRect();
  W3D.mouse.x =  ((clientX - rect.left) / rect.width)  * 2 - 1;
  W3D.mouse.y = -((clientY - rect.top)  / rect.height) * 2 + 1;
};

/* ─── View mode ───────────────────────────────── */

W3D.setViewMode = function (mode) {
  W3D.viewMode = mode;
  if (mode === 'top') {
    const t = W3D.orbitControls.target.clone();
    W3D.camera.position.set(t.x, 45, t.z);
    W3D.camera.lookAt(t.x, 0, t.z);
    W3D.orbitControls.target.copy(t);
  } else {
    W3D.camera.position.set(12, 10, 16);
    W3D.camera.lookAt(0, 0, 0);
    W3D.orbitControls.target.set(0, 0, 0);
  }
  document.getElementById('vp-cam-label').textContent = mode === 'top' ? 'Top View' : 'Perspective';
  document.getElementById('btn-view-persp').classList.toggle('active', mode === 'perspective');
  document.getElementById('btn-view-top').classList.toggle('active', mode === 'top');
};

W3D.focusObject = function (obj) {
  if (!obj || !obj.mesh) return;
  const box    = new THREE.Box3().setFromObject(obj.mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size   = box.getSize(new THREE.Vector3()).length();
  W3D.orbitControls.target.copy(center);
  W3D.camera.position.copy(center).addScaledVector(
    new THREE.Vector3(0.6, 0.6, 1).normalize(), Math.max(size * 2.2, 3)
  );
  W3D.camera.lookAt(center);
};

W3D.toggleGrid = function () {
  W3D.gridHelper.visible = !W3D.gridHelper.visible;
  document.getElementById('btn-grid').classList.toggle('active', W3D.gridHelper.visible);
};

W3D.disposeMesh = function (mesh) {
  if (!mesh) return;
  mesh.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => {
        if (m.map)     m.map.dispose();
        m.dispose();
      });
    }
  });
};

W3D.applyColor = function (mesh, hex) {
  if (!mesh) return;
  mesh.traverse(child => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => { if (m.color) m.color.set(hex); });
    }
  });
};
