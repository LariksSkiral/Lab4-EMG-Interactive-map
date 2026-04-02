/* ═══════════════════════════════════════════════════════
   js/objects/factory.js
   Creates all object types (mesh + metadata).
   Each creator returns an "objData" record:
     { id, type, name, color, mesh, props, files }
   and optionally adds mesh to scene / objects array.
═══════════════════════════════════════════════════════ */

W3D.Factory = {

  /* ── Shared helpers ─────────────────────────── */

  _mat (color = '#c8cdd2', opts = {}) {
    return new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      side: THREE.DoubleSide,
      ...opts,
    });
  },

  _register (mesh, type, name, color, props) {
    const id = W3D.genId();
    mesh.name = name;
    mesh.castShadow   = true;
    mesh.receiveShadow = true;
    mesh.traverse(c => { c.castShadow = true; c.receiveShadow = true; });
    W3D.scene.add(mesh);
    const obj = { id, mesh, type, name, color, props: props || {}, files: [] };
    W3D.objects.push(obj);
    W3D.History.push();
    W3D.SceneTree.rebuild();
    return obj;
  },

  /* ═══════════════════════════════════════════
     ARCHITECTURE
  ═══════════════════════════════════════════ */

  wall ({ width = 4, height = 3, depth = 0.2, color = '#c8cdd2' } = {}) {
    const geo  = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geo, this._mat(color));
    mesh.position.y = height / 2;
    return this._register(mesh, 'wall', 'Wall', color, { width, height, depth, color });
  },

  // Called directly by DrawTool after user draws start/end points
  wallFromPoints (start, end, { height = 3, depth = 0.2, color = '#c8cdd2' } = {}) {
    const dx  = end.x - start.x;
    const dz  = end.z - start.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.05) return null;
    const geo  = new THREE.BoxGeometry(len, height, depth);
    const mesh = new THREE.Mesh(geo, this._mat(color));
    mesh.position.set((start.x + end.x) / 2, height / 2, (start.z + end.z) / 2);
    mesh.rotation.y = -Math.atan2(dz, dx);
    return this._register(mesh, 'wall', 'Wall', color, { width: len, height, depth, color });
  },

  floor ({ width = 6, depth = 6, color = '#d0d5da' } = {}) {
    const geo  = new THREE.BoxGeometry(width, 0.12, depth);
    const mesh = new THREE.Mesh(geo, this._mat(color));
    mesh.position.y = -0.06;
    return this._register(mesh, 'floor', 'Floor', color, { width, height: 0.12, depth, color });
  },

  ceiling ({ width = 6, depth = 6, color = '#d8dde2' } = {}) {
    const geo  = new THREE.BoxGeometry(width, 0.12, depth);
    const mesh = new THREE.Mesh(geo, this._mat(color));
    mesh.position.y = 3;
    return this._register(mesh, 'ceiling', 'Ceiling', color, { width, height: 0.12, depth, color });
  },

  door ({ width = 1, height = 2.2, depth = 0.1, color = '#c4a882' } = {}) {
    const group = new THREE.Group();
    const frameMat = this._mat('#b09070');
    const doorMat  = this._mat(color);

    // Panels
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), doorMat);
    panel.position.y = height / 2;
    group.add(panel);
    // Frame top
    const top = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.12, depth + 0.06), frameMat);
    top.position.y = height + 0.06;
    group.add(top);
    // Frame sides
    [-1, 1].forEach(s => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, height + 0.06, depth + 0.06), frameMat);
      side.position.set(s * (width / 2 + 0.05), height / 2, 0);
      group.add(side);
    });
    return this._register(group, 'door', 'Door Frame', color, { width, height, depth, color });
  },

  window ({ width = 1.2, height = 1.2, depth = 0.1, color = '#aad4ee' } = {}) {
    const group = new THREE.Group();
    const frameMat = this._mat('#8a9aaa');
    const glassMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.38, side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.1, height - 0.1), glassMat);
    group.add(glass);
    // Frame edges
    [['x', width], ['y', height]].forEach(([axis, len]) => {
      [-1, 1].forEach(s => {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(axis === 'x' ? 0.08 : len, axis === 'x' ? len : 0.08, depth),
          frameMat
        );
        bar.position[axis] = s * (len / 2 + 0.04 - (axis === 'x' ? 0 : 0));
        group.add(bar);
      });
    });
    group.position.y = 1.4;
    return this._register(group, 'window', 'Window Frame', color, { width, height, depth, color });
  },

  staircase ({ steps = 8, stepW = 1.2, stepH = 0.18, stepD = 0.3, color = '#b0b8c0' } = {}) {
    const group = new THREE.Group();
    const mat   = this._mat(color);
    for (let i = 0; i < steps; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH, stepD), mat);
      step.position.set(0, stepH / 2 + i * stepH, -i * stepD);
      step.castShadow = true;
      group.add(step);
    }
    return this._register(group, 'staircase', 'Staircase', color, { steps, stepW, stepH, stepD, color });
  },

  column ({ radius = 0.2, height = 3, color = '#c0c0c8' } = {}) {
    const geo  = new THREE.CylinderGeometry(radius, radius * 1.15, height, 16);
    const mesh = new THREE.Mesh(geo, this._mat(color));
    mesh.position.y = height / 2;
    return this._register(mesh, 'column', 'Column', color, { radius, height, color });
  },

  /* ═══════════════════════════════════════════
     PRIMITIVES
  ═══════════════════════════════════════════ */

  box ({ width = 1, height = 1, depth = 1, color = '#b4c2d0' } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this._mat(color));
    mesh.position.y = height / 2;
    return this._register(mesh, 'box', 'Box', color, { width, height, depth, color });
  },

  cylinder ({ radiusTop = 0.5, radiusBottom = 0.5, height = 1, color = '#b4c2d0' } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 32),
      this._mat(color)
    );
    mesh.position.y = height / 2;
    return this._register(mesh, 'cylinder', 'Cylinder', color, { radiusTop, radiusBottom, height, color });
  },

  sphere ({ radius = 0.5, color = '#b4c2d0' } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 32, 32),
      this._mat(color)
    );
    mesh.position.y = radius;
    return this._register(mesh, 'sphere', 'Sphere', color, { radius, color });
  },

  cone ({ radius = 0.5, height = 1, color = '#b4c2d0' } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 32),
      this._mat(color)
    );
    mesh.position.y = height / 2;
    return this._register(mesh, 'cone', 'Cone', color, { radius, height, color });
  },

  plane ({ width = 2, height = 2, color = '#b4c2d0' } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      this._mat(color)
    );
    mesh.rotation.x = -Math.PI / 2;
    return this._register(mesh, 'plane', 'Plane', color, { width, height, color });
  },

  /* ═══════════════════════════════════════════
     LINES & ZONES
  ═══════════════════════════════════════════ */

  // Builds a multi-segment floor line from an array of {x,z} world points.
  floorLine (points, { color = '#f5c200', lineWidth = 0.08 } = {}) {
    if (!points || points.length < 2) return null;

    // Use a Line (not mesh boxes) drawn in 3D space - always visible above floor
    // Also add mesh strips for thickness
    const group = new THREE.Group();
    group.renderOrder = 2;

    // Thin flat strips for each segment
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      depthWrite: false,
    });

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i], p2 = points[i + 1];
      const dx = p2.x - p1.x, dz = p2.z - p1.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) continue;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.008, lineWidth), mat.clone());
      seg.position.set((p1.x + p2.x) / 2, 0.04, (p1.z + p2.z) / 2);
      seg.rotation.y = -Math.atan2(dz, dx);
      seg.renderOrder = 2;
      group.add(seg);
      // Cap dot
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(lineWidth * 0.6, lineWidth * 0.6, 0.008, 8), mat.clone());
      dot.position.set(p1.x, 0.04, p1.z);
      dot.renderOrder = 2;
      group.add(dot);
    }
    // Final cap dot
    const last = points[points.length - 1];
    const mat2 = mat.clone();
    const lastDot = new THREE.Mesh(new THREE.CylinderGeometry(lineWidth * 0.6, lineWidth * 0.6, 0.008, 8), mat2);
    lastDot.position.set(last.x, 0.04, last.z);
    lastDot.renderOrder = 2;
    group.add(lastDot);

    return this._register(group, 'floorline', 'Floor Line', color, { points, color, lineWidth });
  },

  // Builds a filled polygon zone from {x,z} world points.
  zone (points, { color = '#e8720c', opacity = 0.13, label = 'Zone' } = {}) {
    if (!points || points.length < 3) return null;

    // Build shape in XZ plane using a flat GROUP approach to avoid rotation confusion.
    // We create geometry directly in the XZ plane so no rotation is needed.
    const group = new THREE.Group();
    group.position.y = 0.03; // float just above ground

    // Filled polygon - use ShapeGeometry in XY plane then correct rotation on a sub-mesh
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].z);
    shape.closePath();

    const fillGeo = new THREE.ShapeGeometry(shape);
    const fillMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true, opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.renderOrder = 1;
    group.add(fill);

    // Outline using LineLoop in XZ plane directly (no rotation needed)
    const outlinePoints = points.map(p => new THREE.Vector3(p.x, 0, p.z));
    outlinePoints.push(outlinePoints[0].clone()); // close loop
    const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
    const outlineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(color) });
    const outline = new THREE.Line(outlineGeo, outlineMat);
    group.add(outline);

    return this._register(group, 'zone', label, color, { points, color, opacity, label });
  },

  arrow ({ color = '#e8720c', length = 1.5 } = {}) {
    const group = new THREE.Group();
    const mat   = this._mat(color);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, length, 8), mat);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = length / 2;
    group.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.35, 8), mat);
    head.rotation.z = -Math.PI / 2;
    head.position.x = length + 0.18;
    group.add(head);
    return this._register(group, 'arrow', 'Arrow', color, { color, length });
  },

  /* ═══════════════════════════════════════════
     INFO & LABELS
  ═══════════════════════════════════════════ */

  infoPoint ({ label = 'Info Point', description = '', color = '#e8720c' } = {}) {
    const group = new THREE.Group();
    const seed  = Math.random() * Math.PI * 2;

    // Sphere body
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 20, 20),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(color) })
    );
    group.add(sphere);

    // Inner glow dot
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
    );
    group.add(inner);

    // Animated ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.34, 36),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.userData.isRing = true;
    group.add(ring);

    // Vertical stem line
    const stemGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6);
    const stem    = new THREE.Mesh(stemGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.6 }));
    stem.position.y = -0.8;
    group.add(stem);

    group.position.y = 1.4;
    group.userData.isInfoPoint = true;

    const obj = this._register(group, 'infopoint', label, color, { label, description, color, _baseY: 1.4 });
    obj._seed = seed;
    return obj;
  },

  label3d ({ text = 'Label', color = '#333333', size = 0.45 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width  = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    // Background pill
    ctx.fillStyle = 'rgba(20,20,20,0.72)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 120, 18);
    ctx.fill();
    // Text
    ctx.fillStyle = color;
    ctx.font = 'bold 52px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);

    const tex = new THREE.CanvasTexture(canvas);
    const w   = size * text.length * 0.38 + size;
    const geo = new THREE.PlaneGeometry(w, size * 0.55);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 2;
    return this._register(mesh, 'label3d', 'Label: ' + text, color, { text, color, size });
  },

  imagePlane ({ width = 2, height = 1.5, color = '#333333' } = {}) {
    const mat  = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    mesh.position.y = height / 2 + 0.01;
    return this._register(mesh, 'image-plane', 'Image Plane', color, { width, height, color });
  },

  /* ═══════════════════════════════════════════
     LIGHTS
  ═══════════════════════════════════════════ */

  pointLight ({ color = '#fff4cc', intensity = 1.2, distance = 12 } = {}) {
    const light = new THREE.PointLight(new THREE.Color(color), intensity, distance);
    light.position.set(0, 2.5, 0);
    light.castShadow = true;
    // Visual helper sphere
    const helper = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
    );
    light.add(helper);
    W3D.scene.add(light);
    const obj = { id: W3D.genId(), mesh: light, type: 'point-light', name: 'Point Light', color, props: { color, intensity, distance }, files: [] };
    W3D.objects.push(obj);
    W3D.History.push();
    W3D.SceneTree.rebuild();
    return obj;
  },

  spotLight ({ color = '#333333', intensity = 1.2, distance = 18, angle = 0.45 } = {}) {
    const light = new THREE.SpotLight(new THREE.Color(color), intensity, distance, angle);
    light.position.set(0, 5, 0);
    light.castShadow = true;
    const helper = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.35, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
    );
    light.add(helper);
    W3D.scene.add(light);
    const obj = { id: W3D.genId(), mesh: light, type: 'spot-light', name: 'Spot Light', color, props: { color, intensity, distance, angle }, files: [] };
    W3D.objects.push(obj);
    W3D.History.push();
    W3D.SceneTree.rebuild();
    return obj;
  },

  /* ═══════════════════════════════════════════
     LOAD GLB
  ═══════════════════════════════════════════ */

  loadGLB (file) {
    const url    = URL.createObjectURL(file);
    const loader = new THREE.GLTFLoader();
    W3D.notify('Loading model…', 'warn');
    loader.load(url, gltf => {
      const model = gltf.scene;
      model.traverse(c => { c.castShadow = true; c.receiveShadow = true; });
      // Auto-scale to sensible size
      const box  = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3()).length();
      if (size > 8) { const s = 4 / size; model.scale.set(s, s, s); }
      W3D.scene.add(model);
      const obj = {
        id: W3D.genId(), mesh: model, type: 'glb',
        name: file.name.replace(/\.(glb|gltf)$/i, ''),
        color: '#ffffff', props: { filename: file.name }, files: [],
      };
      W3D.objects.push(obj);
      W3D.History.push();
      W3D.SceneTree.rebuild();
      W3D.Select.pick(obj);
      W3D.notify('Model loaded: ' + obj.name, 'success');
      URL.revokeObjectURL(url);
    }, undefined, err => {
      W3D.notify('Failed to load model: ' + err.message, 'error');
      URL.revokeObjectURL(url);
    });
  },

  /* ═══════════════════════════════════════════
     REBUILD GEOMETRY (for inspector dimension edits)
  ═══════════════════════════════════════════ */

  rebuildGeometry (obj) {
    if (!obj.mesh) return;
    const pos = obj.mesh.position.clone();
    const rot = obj.mesh.rotation.clone();
    const scl = obj.mesh.scale.clone();
    const wasAttached = W3D.transformControls.object === obj.mesh;

    W3D.scene.remove(obj.mesh);
    W3D.disposeMesh(obj.mesh);

    const p = obj.props;
    let newMesh = null;
    switch (obj.type) {
      case 'wall':     newMesh = new THREE.Mesh(new THREE.BoxGeometry(p.width, p.height, p.depth), this._mat(obj.color)); break;
      case 'floor':
      case 'ceiling':  newMesh = new THREE.Mesh(new THREE.BoxGeometry(p.width, p.height || 0.12, p.depth), this._mat(obj.color)); break;
      case 'box':      newMesh = new THREE.Mesh(new THREE.BoxGeometry(p.width, p.height, p.depth), this._mat(obj.color)); break;
      case 'cylinder': newMesh = new THREE.Mesh(new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 32), this._mat(obj.color)); break;
      case 'sphere':   newMesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 32, 32), this._mat(obj.color)); break;
      case 'cone':     newMesh = new THREE.Mesh(new THREE.ConeGeometry(p.radius, p.height, 32), this._mat(obj.color)); break;
      case 'plane':    newMesh = new THREE.Mesh(new THREE.PlaneGeometry(p.width, p.height), this._mat(obj.color)); break;
      default: return;
    }
    newMesh.castShadow   = true;
    newMesh.receiveShadow = true;
    newMesh.position.copy(pos);
    newMesh.rotation.copy(rot);
    newMesh.scale.copy(scl);
    W3D.scene.add(newMesh);
    obj.mesh = newMesh;

    if (wasAttached) W3D.transformControls.attach(newMesh);
  },

  rebuildLabel3d (obj) {
    if (!obj.mesh) return;
    const pos = obj.mesh.position.clone();
    const rot = obj.mesh.rotation.clone();
    W3D.scene.remove(obj.mesh);
    W3D.disposeMesh(obj.mesh);
    // Rebuild via label3d but don't re-register
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(20,20,20,0.72)';
    ctx.beginPath(); ctx.roundRect(4, 4, 504, 120, 18); ctx.fill();
    ctx.fillStyle = obj.props.color || '#ffffff';
    ctx.font = 'bold 52px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(obj.props.text || '', 256, 68);
    const tex = new THREE.CanvasTexture(canvas);
    const s = obj.props.size || 0.45;
    const w = s * (obj.props.text || '').length * 0.38 + s;
    const geo = new THREE.PlaneGeometry(w, s * 0.55);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const newMesh = new THREE.Mesh(geo, mat);
    newMesh.position.copy(pos);
    newMesh.rotation.copy(rot);
    W3D.scene.add(newMesh);
    obj.mesh = newMesh;
    if (W3D.transformControls.object === obj.mesh) W3D.transformControls.attach(newMesh);
  },

  /* ═══════════════════════════════════════════
     RECONSTRUCT (from saved data)
  ═══════════════════════════════════════════ */

  reconstruct (entry) {
    const p = entry.props || {};
    let obj = null;

    switch (entry.type) {
      case 'wall': {
        // Reconstruct as a plain box; position/rotation applied below
        const geo = new THREE.BoxGeometry(p.width || 4, p.height || 3, p.depth || 0.2);
        const mesh = new THREE.Mesh(geo, this._mat(p.color || '#c8cdd2'));
        mesh.castShadow = true; mesh.receiveShadow = true;
        W3D.scene.add(mesh);
        obj = { id: W3D.genId(), mesh, type: 'wall', name: 'Wall', color: p.color || '#c8cdd2', props: p, files: [] };
        W3D.objects.push(obj);
        break;
      }
      case 'floor':       obj = this.floor(p); break;
      case 'ceiling':     obj = this.ceiling(p); break;
      case 'door':        obj = this.door(p); break;
      case 'window':      obj = this.window(p); break;
      case 'staircase':   obj = this.staircase(p); break;
      case 'column':      obj = this.column(p); break;
      case 'box':         obj = this.box(p); break;
      case 'cylinder':    obj = this.cylinder(p); break;
      case 'sphere':      obj = this.sphere(p); break;
      case 'cone':        obj = this.cone(p); break;
      case 'plane':       obj = this.plane(p); break;
      case 'floorline': {
        if (p.points && p.points.length >= 2) {
          obj = this.floorLine(p.points, p);
        }
        break;
      }
      case 'zone': {
        if (p.points && p.points.length >= 3) {
          obj = this.zone(p.points, p);
        } else {
          // Fallback if points missing
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.MeshBasicMaterial({color:0xe8720c,transparent:true,opacity:0.13,side:THREE.DoubleSide}));
          mesh.rotation.x = -Math.PI/2; mesh.position.y = 0.03;
          W3D.scene.add(mesh);
          obj = { id: W3D.genId(), mesh, type: 'zone', name: p.label||'Zone', color: p.color||'#e8720c', props: p, files: [] };
          W3D.objects.push(obj);
        }
        break;
      }
      case 'arrow':       obj = this.arrow(p); break;
      case 'infopoint':   obj = this.infoPoint(p); break;
      case 'label3d':     obj = this.label3d(p); break;
      case 'image-plane': obj = this.imagePlane(p); break;
      case 'point-light': obj = this.pointLight(p); break;
      case 'spot-light':  obj = this.spotLight(p); break;
      default:            obj = this.box(p); break;
    }
    if (!obj) return;

    obj.id    = entry.id;
    obj.name  = entry.name;
    obj.color = entry.color;
    obj.files = entry.files || [];
    if (entry.position && obj.mesh) obj.mesh.position.set(entry.position.x, entry.position.y, entry.position.z);
    if (entry.rotation && obj.mesh) obj.mesh.rotation.set(entry.rotation.x, entry.rotation.y, entry.rotation.z);
    if (entry.scale    && obj.mesh) obj.mesh.scale.set(entry.scale.x, entry.scale.y, entry.scale.z);
    if (entry.visible  !== undefined && obj.mesh) obj.mesh.visible = entry.visible;
  },
};
