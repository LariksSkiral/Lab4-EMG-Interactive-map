/* ═══════════════════════════════════════════════════════
   js/core/saveload.js
   Save scene to .w3d file / Load scene from .w3d file.
   .w3d format: JSON with full object definitions.
═══════════════════════════════════════════════════════ */

W3D.Save = {

  /* ── Export ── */
  save () {
    const payload = {
      version:  3,
      name:     W3D.sceneName,
      objects:  W3D.objects.map(obj => {
        const entry = {
          id:      obj.id,
          type:    obj.type,
          name:    obj.name,
          color:   obj.color,
          props:   JSON.parse(JSON.stringify(obj.props || {})),
          visible: obj.mesh ? obj.mesh.visible : true,
          files:   (obj.files || []).map(f => ({ name: f.name, type: f.type, data: f.data })),
        };
        if (obj.mesh) {
          entry.position = { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z };
          entry.rotation = { x: obj.mesh.rotation.x, y: obj.mesh.rotation.y, z: obj.mesh.rotation.z };
          entry.scale    = { x: obj.mesh.scale.x,    y: obj.mesh.scale.y,    z: obj.mesh.scale.z    };
        }
        return entry;
      }),
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: (W3D.sceneName || 'scene').replace(/[^a-zA-Z0-9_\- ]/g, '_') + '.w3d',
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    W3D.notify('Scene saved ✓', 'success');
  },

  /* ── Import ── */
  load (jsonText) {
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      W3D.notify('Invalid .w3d file — could not parse JSON', 'error');
      return;
    }

    if (!data.objects) {
      W3D.notify('Invalid .w3d file — missing objects array', 'error');
      return;
    }

    // Pause history during load to avoid spurious snapshots
    W3D.History._paused = true;

    // Clear current scene
    W3D.transformControls.detach();
    W3D.selectedObject = null;
    W3D.objects.forEach(o => {
      if (o.mesh) { W3D.scene.remove(o.mesh); W3D.disposeMesh(o.mesh); }
    });
    W3D.objects     = [];
    W3D.undoStack   = [];
    W3D.redoStack   = [];
    W3D.idCounter   = 0;

    W3D.sceneName = data.name || 'Untitled Scene';
    document.getElementById('scene-name').textContent = W3D.sceneName;

    // Reconstruct each object
    let loaded = 0, failed = 0;
    data.objects.forEach(entry => {
      try {
        W3D.Factory.reconstruct(entry);
        // The last-pushed object may have a new id — fix it
        const obj = W3D.objects[W3D.objects.length - 1];
        if (obj) {
          obj.id    = entry.id;
          obj.name  = entry.name;
          obj.color = entry.color;
          obj.files = entry.files || [];
          if (entry.position && obj.mesh) obj.mesh.position.set(entry.position.x, entry.position.y, entry.position.z);
          if (entry.rotation && obj.mesh) obj.mesh.rotation.set(entry.rotation.x, entry.rotation.y, entry.rotation.z);
          if (entry.scale    && obj.mesh) obj.mesh.scale.set(entry.scale.x, entry.scale.y, entry.scale.z);
          if (entry.visible  !== undefined && obj.mesh) obj.mesh.visible = entry.visible;
          W3D.applyColor(obj.mesh, obj.color);
        }
        loaded++;
      } catch (e) {
        console.warn('Failed to reconstruct object:', entry, e);
        failed++;
      }
    });

    W3D.History._paused = false;

    W3D.SceneTree.rebuild();
    W3D.Inspector.clear();

    const msg = failed
      ? `Loaded ${loaded} objects (${failed} failed)`
      : `Scene loaded — ${loaded} objects ✓`;
    W3D.notify(msg, failed ? 'warn' : 'success');
  },
};
