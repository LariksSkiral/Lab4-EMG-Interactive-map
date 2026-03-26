/* ═══════════════════════════════════════════════════════
   js/core/saveload.js
   Save scene to .w3d file / Load scene from .w3d file.
   GLB models are excluded (binary data, reference only).
═══════════════════════════════════════════════════════ */

W3D.Save = {

  save () {
    const payload = {
      version:  2,
      name:     W3D.sceneName,
      objects:  W3D.objects.map(obj => {
        const entry = {
          id:      obj.id,
          type:    obj.type,
          name:    obj.name,
          color:   obj.color,
          props:   { ...obj.props },
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

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: W3D.sceneName + '.w3d' });
    a.click();
    URL.revokeObjectURL(url);
    W3D.notify('Scene saved ✓', 'success');
  },

  load (jsonText) {
    let data;
    try { data = JSON.parse(jsonText); }
    catch { W3D.notify('Invalid file format', 'error'); return; }

    // Clear scene
    W3D.objects.forEach(o => { if (o.mesh) { W3D.scene.remove(o.mesh); W3D.disposeMesh(o.mesh); } });
    W3D.objects = [];
    W3D.transformControls.detach();
    W3D.selectedObject = null;
    W3D.idCounter = 0;

    W3D.sceneName = data.name || 'Untitled Scene';
    document.getElementById('scene-name').textContent = W3D.sceneName;

    (data.objects || []).forEach(entry => W3D.Factory.reconstruct(entry));

    W3D.SceneTree.rebuild();
    W3D.Inspector.clear();
    W3D.notify('Scene loaded ✓', 'success');
  },
};
