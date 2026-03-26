/* ═══════════════════════════════════════════════════════
   js/tools/select.js
   Object picking, selection highlight, transform controls,
   delete, duplicate, focus.
═══════════════════════════════════════════════════════ */

W3D.Select = {

  /* ── Pick an object (internal or from scene click) ── */
  pick (obj) {
    this._clearHighlight();
    W3D.selectedObject = obj;
    if (obj && obj.mesh) {
      this._applyHighlight(obj.mesh);
      if (W3D.isAdmin) {
        W3D.transformControls.attach(obj.mesh);
        this._syncTransformMode();
      }
    }
    W3D.Inspector.build(obj);
    W3D.SceneTree.rebuild();
  },

  /* ── Deselect ── */
  clear () {
    this._clearHighlight();
    W3D.selectedObject = null;
    W3D.transformControls.detach();
    W3D.Inspector.clear();
    W3D.SceneTree.rebuild();
  },

  /* ── Delete selected ── */
  deleteSelected () {
    if (!W3D.selectedObject || !W3D.isAdmin) return;
    this.deleteObject(W3D.selectedObject);
  },

  deleteObject (obj) {
    if (!W3D.isAdmin) return;
    W3D.History.push();
    if (obj.mesh) { W3D.scene.remove(obj.mesh); W3D.disposeMesh(obj.mesh); }
    W3D.objects = W3D.objects.filter(o => o !== obj);
    W3D.transformControls.detach();
    W3D.selectedObject = null;
    W3D.Inspector.clear();
    W3D.SceneTree.rebuild();
    W3D.notify('Deleted "' + obj.name + '"');
  },

  /* ── Duplicate ── */
  duplicate (obj) {
    if (!obj || !obj.mesh || !W3D.isAdmin) return;
    W3D.History.push();
    const newMesh = obj.mesh.clone();
    newMesh.position.x += 1;
    W3D.scene.add(newMesh);
    const newObj = {
      id:    W3D.genId(),
      mesh:  newMesh,
      type:  obj.type,
      name:  obj.name + ' (Copy)',
      color: obj.color,
      props: JSON.parse(JSON.stringify(obj.props)),
      files: [],
    };
    W3D.objects.push(newObj);
    this.pick(newObj);
    W3D.SceneTree.rebuild();
    W3D.notify('Duplicated');
  },

  /* ── Focus camera on object ── */
  focus (obj) {
    W3D.focusObject(obj || W3D.selectedObject);
  },

  /* ── Sync transform control mode ── */
  _syncTransformMode () {
    if (!W3D.transformControls) return;
    const modes = { select: 'translate', rotate: 'rotate', scale: 'scale' };
    W3D.transformControls.setMode(modes[W3D.activeTool] || 'translate');
  },

  setTool (tool) {
    W3D.activeTool = tool;
    ['select', 'rotate', 'scale'].forEach(t => {
      document.getElementById('tool-' + t)?.classList.toggle('active', t === tool);
    });
    this._syncTransformMode();
  },

  /* ── Highlight: orange emissive outline ── */
  _highlighted: [],

  _applyHighlight (mesh) {
    this._highlighted = [];
    mesh.traverse(child => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => {
        if (!m.emissive) return;
        if (!m._origEmissive) m._origEmissive = m.emissive.clone();
        m.emissive.set(0xe84800);   // warm orange glow
        m.emissiveIntensity = 0.25;
        this._highlighted.push(m);
      });
    });
  },

  _clearHighlight () {
    this._highlighted.forEach(m => {
      if (m._origEmissive) {
        m.emissive.copy(m._origEmissive);
        delete m._origEmissive;
      }
      m.emissiveIntensity = 0;
    });
    this._highlighted = [];
    // Also clear any previously selected mesh not caught above
    W3D.objects.forEach(o => {
      if (!o.mesh) return;
      o.mesh.traverse(child => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => {
          if (m._origEmissive) {
            m.emissive.copy(m._origEmissive);
            m.emissiveIntensity = 0;
            delete m._origEmissive;
          }
        });
      });
    });
  },
};
