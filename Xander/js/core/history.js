/* ═══════════════════════════════════════════════════════
   js/core/history.js
   Undo / Redo — captures transform state of all objects.
═══════════════════════════════════════════════════════ */

W3D.History = {

  push () {
    const snap = this._snapshot();
    W3D.undoStack.push(snap);
    if (W3D.undoStack.length > 60) W3D.undoStack.shift();
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

  _snapshot () {
    return W3D.objects.map(o => ({
      id: o.id,
      px: o.mesh?.position.x ?? 0,  py: o.mesh?.position.y ?? 0,  pz: o.mesh?.position.z ?? 0,
      rx: o.mesh?.rotation.x ?? 0,  ry: o.mesh?.rotation.y ?? 0,  rz: o.mesh?.rotation.z ?? 0,
      sx: o.mesh?.scale.x    ?? 1,  sy: o.mesh?.scale.y    ?? 1,  sz: o.mesh?.scale.z    ?? 1,
    }));
  },

  _apply (snap) {
    snap.forEach(s => {
      const obj = W3D.objects.find(o => o.id === s.id);
      if (!obj || !obj.mesh) return;
      obj.mesh.position.set(s.px, s.py, s.pz);
      obj.mesh.rotation.set(s.rx, s.ry, s.rz);
      obj.mesh.scale.set(s.sx, s.sy, s.sz);
    });
    W3D.SceneTree.rebuild();
    if (W3D.selectedObject) W3D.Inspector.sync();
  },
};
