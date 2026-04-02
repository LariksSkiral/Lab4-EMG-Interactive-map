/* ═══════════════════════════════════════════════════════
   js/core/history.js
   Undo / Redo — full scene snapshot (transforms + object list).
   Snapshots store serialisable data only (no Three.js refs).
   On apply, objects that no longer exist are removed from scene,
   and new ones are reconstructed via Factory.reconstruct().
═══════════════════════════════════════════════════════ */

W3D.History = {

  _limit: 60,
  _paused: false,   // pause during reconstruct to avoid recursive pushes

  push () {
    if (this._paused) return;
    W3D.undoStack.push(this._snapshot());
    if (W3D.undoStack.length > this._limit) W3D.undoStack.shift();
    W3D.redoStack = [];
  },

  undo () {
    if (!W3D.undoStack.length) { W3D.notify('Nothing to undo', 'warn'); return; }
    W3D.redoStack.push(this._snapshot());
    this._apply(W3D.undoStack.pop());
    W3D.notify('Undone');
  },

  redo () {
    if (!W3D.redoStack.length) { W3D.notify('Nothing to redo', 'warn'); return; }
    W3D.undoStack.push(this._snapshot());
    this._apply(W3D.redoStack.pop());
    W3D.notify('Redone');
  },

  /* ── Full serialisable snapshot ── */
  _snapshot () {
    return W3D.objects.map(o => {
      const entry = {
        id:      o.id,
        type:    o.type,
        name:    o.name,
        color:   o.color,
        props:   JSON.parse(JSON.stringify(o.props || {})),
        visible: o.mesh ? o.mesh.visible : true,
        files:   (o.files || []).map(f => ({ name: f.name, type: f.type, data: f.data })),
      };
      if (o.mesh) {
        entry.position = { x: o.mesh.position.x, y: o.mesh.position.y, z: o.mesh.position.z };
        entry.rotation = { x: o.mesh.rotation.x, y: o.mesh.rotation.y, z: o.mesh.rotation.z };
        entry.scale    = { x: o.mesh.scale.x,    y: o.mesh.scale.y,    z: o.mesh.scale.z    };
      }
      return entry;
    });
  },

  /* ── Restore a snapshot ── */
  _apply (snap) {
    this._paused = true;

    const snapIds = new Set(snap.map(s => s.id));
    const currIds = new Set(W3D.objects.map(o => o.id));

    // 1. Remove objects that don't exist in snapshot
    W3D.objects.filter(o => !snapIds.has(o.id)).forEach(o => {
      if (o.mesh) { W3D.scene.remove(o.mesh); W3D.disposeMesh(o.mesh); }
    });
    W3D.objects = W3D.objects.filter(o => snapIds.has(o.id));

    // 2. Apply transforms to surviving objects
    snap.forEach(s => {
      const existing = W3D.objects.find(o => o.id === s.id);
      if (existing && existing.mesh) {
        if (s.position) existing.mesh.position.set(s.position.x, s.position.y, s.position.z);
        if (s.rotation) existing.mesh.rotation.set(s.rotation.x, s.rotation.y, s.rotation.z);
        if (s.scale)    existing.mesh.scale.set(s.scale.x, s.scale.y, s.scale.z);
        existing.mesh.visible = s.visible !== false;
        existing.name   = s.name;
        existing.color  = s.color;
        existing.props  = s.props;
        existing.files  = s.files || [];
        W3D.applyColor(existing.mesh, s.color);
      }
    });

    // 3. Reconstruct objects that exist in snapshot but not in current scene
    snap.filter(s => !currIds.has(s.id)).forEach(s => {
      W3D.Factory.reconstruct(s);
      // Find just-added object and fix its id (reconstruct assigns new id)
      const added = W3D.objects[W3D.objects.length - 1];
      if (added) {
        added.id = s.id;
        if (s.position && added.mesh) added.mesh.position.set(s.position.x, s.position.y, s.position.z);
        if (s.rotation && added.mesh) added.mesh.rotation.set(s.rotation.x, s.rotation.y, s.rotation.z);
        if (s.scale    && added.mesh) added.mesh.scale.set(s.scale.x, s.scale.y, s.scale.z);
      }
    });

    // 4. Deselect if selected object was removed
    if (W3D.selectedObject && !W3D.objects.includes(W3D.selectedObject)) {
      W3D.transformControls.detach();
      W3D.selectedObject = null;
      W3D.Inspector.clear();
    }

    this._paused = false;
    W3D.SceneTree.rebuild();
  },
};
