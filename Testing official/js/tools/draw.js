/* ═══════════════════════════════════════════════════════
   js/tools/draw.js
   Interactive drawing tools: wall, zone, floor line.
   Each mode intercepts viewport clicks until finished.
═══════════════════════════════════════════════════════ */

W3D.Draw = {

  /* ── Start a drawing mode ── */
  start (mode) {
    this.cancel();
    W3D.draw.active = true;
    W3D.draw.mode   = mode;
    W3D.draw.points = [];
    W3D.orbitControls.enabled = false;
    document.getElementById('three-canvas').style.cursor = 'crosshair';

    const hints = {
      wall:      'Click to place wall start — click again to finish. Esc to cancel.',
      zone:      'Click to add zone corners — double-click or click first point to close. Esc to cancel.',
      floorline: 'Click to add line points — double-click to finish. Esc to cancel.',
    };
    this._showHint(hints[mode] || '');

    // Mark active create button
    const btnMap = { wall: 'c-wall', zone: 'c-zone', floorline: 'c-floorline' };
    if (btnMap[mode]) document.getElementById(btnMap[mode])?.classList.add('drawing');
  },

  /* ── Handle viewport click while drawing ── */
  handleClick (e) {
    if (!W3D.draw.active) return false;
    const pt = W3D.getGroundPoint(e.clientX, e.clientY);
    if (!pt) return true;

    const mode = W3D.draw.mode;

    if (mode === 'wall') {
      if (!W3D.draw.startPoint) {
        W3D.draw.startPoint = pt;
        this._updatePreview(pt, pt);
      } else {
        this._destroyPreview();
        W3D.Factory.wallFromPoints(W3D.draw.startPoint, pt);
        this.cancel();
      }
    }

    if (mode === 'floorline' || mode === 'zone') {
      // If clicking very close to first point — close the zone
      if (mode === 'zone' && W3D.draw.points.length >= 3) {
        const first = W3D.draw.points[0];
        const dist  = Math.sqrt((pt.x - first.x) ** 2 + (pt.z - first.z) ** 2);
        if (dist < 0.6) { this.finishCurrent(); return true; }
      }
      W3D.draw.points.push({ x: pt.x, z: pt.z });
      this._updatePolyPreview();
    }

    return true;
  },

  /* ── Handle double-click (finish zone / line) ── */
  handleDblClick (e) {
    if (!W3D.draw.active) return false;
    if (W3D.draw.mode === 'zone' || W3D.draw.mode === 'floorline') {
      this.finishCurrent();
      return true;
    }
    return false;
  },

  /* ── Mouse-move: update wall preview ── */
  handleMouseMove (e) {
    if (!W3D.draw.active) return;
    const pt = W3D.getGroundPoint(e.clientX, e.clientY);
    if (!pt) return;
    if (W3D.draw.mode === 'wall' && W3D.draw.startPoint) {
      this._updatePreview(W3D.draw.startPoint, pt);
    }
  },

  /* ── Finish the current polygon / line ── */
  finishCurrent () {
    const pts = W3D.draw.points;
    if (W3D.draw.mode === 'floorline' && pts.length >= 2) {
      W3D.Factory.floorLine(pts);
    } else if (W3D.draw.mode === 'zone' && pts.length >= 3) {
      W3D.Factory.zone(pts);
    } else {
      W3D.notify('Need more points to finish', 'warn');
      return;
    }
    this.cancel();
  },

  /* ── Cancel / reset drawing state ── */
  cancel () {
    this._destroyPreview();
    W3D.draw.active     = false;
    W3D.draw.mode       = null;
    W3D.draw.points     = [];
    W3D.draw.startPoint = null;
    W3D.orbitControls.enabled = true;
    document.getElementById('three-canvas').style.cursor = '';
    this._showHint('');
    // Clear drawing class from buttons
    document.querySelectorAll('.create-btn').forEach(b => b.classList.remove('drawing'));
  },

  /* ── Wall preview mesh ── */
  _updatePreview (start, end) {
    this._destroyPreview();
    const dx = end.x - start.x, dz = end.z - start.z;
    const len = Math.max(0.05, Math.sqrt(dx * dx + dz * dz));
    const geo = new THREE.BoxGeometry(len, 3, 0.2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8720c, transparent: true, opacity: 0.45 });
    W3D.draw.previewMesh = new THREE.Mesh(geo, mat);
    W3D.draw.previewMesh.position.set((start.x + end.x) / 2, 1.5, (start.z + end.z) / 2);
    W3D.draw.previewMesh.rotation.y = -Math.atan2(dz, dx);
    W3D.scene.add(W3D.draw.previewMesh);
  },

  /* ── Polygon preview (zone/line) ── */
  _updatePolyPreview () {
    this._destroyPreview();
    const pts = W3D.draw.points;
    if (pts.length < 2) return;

    // Draw lines between accumulated points
    const group = new THREE.Group();
    const mat   = new THREE.MeshBasicMaterial({ color: 0xe8720c, transparent: true, opacity: 0.6 });
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const dx = p2.x - p1.x, dz = p2.z - p1.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) continue;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.08), mat.clone());
      seg.position.set((p1.x + p2.x) / 2, 0.02, (p1.z + p2.z) / 2);
      seg.rotation.y = -Math.atan2(dz, dx);
      group.add(seg);
    }
    // Vertex dots
    pts.forEach(p => {
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), mat.clone());
      dot.position.set(p.x, 0.02, p.z);
      group.add(dot);
    });
    W3D.draw.previewMesh = group;
    W3D.scene.add(group);
  },

  _destroyPreview () {
    if (W3D.draw.previewMesh) {
      W3D.scene.remove(W3D.draw.previewMesh);
      W3D.disposeMesh(W3D.draw.previewMesh);
      W3D.draw.previewMesh = null;
    }
  },

  _showHint (msg) {
    const el = document.getElementById('draw-hint');
    if (!el) return;
    if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
    else      { el.classList.add('hidden'); }
  },
};
