/* ═══════════════════════════════════════════════════════
   js/ui/inspector.js
   Right-side inspector panel.
   1 Three.js unit = 1 metre throughout.
═══════════════════════════════════════════════════════ */

W3D.Inspector = {

  build (obj) {
    const body  = document.getElementById('inspector-body');
    const badge = document.getElementById('insp-type-badge');
    if (!obj) { this.clear(); return; }

    badge.textContent = obj.type.toUpperCase();
    badge.classList.add('active');

    const S = []; // sections array

    /* ── Name / Type ── */
    S.push(this._sec('Object', `
      ${this._row('Name', this._txt('insp-name', obj.name))}
      ${this._row('Type', `<span style="color:var(--text-2);font-size:11px">${obj.type}</span>`)}
    `));

    /* ── Transform ── */
    const pos = obj.mesh?.position ?? {x:0,y:0,z:0};
    const rot = obj.mesh ? {
      x: this._deg(obj.mesh.rotation.x),
      y: this._deg(obj.mesh.rotation.y),
      z: this._deg(obj.mesh.rotation.z),
    } : {x:0,y:0,z:0};
    const scl = obj.mesh?.scale ?? {x:1,y:1,z:1};

    S.push(this._sec('Transform', `
      <div class="insp-scale-note">1 unit = 1 metre</div>
      ${this._row('Pos m',   this._xyz3('pos', pos.x, pos.y, pos.z))}
      ${this._row('Rot °',   this._xyz3('rot', rot.x, rot.y, rot.z))}
      ${this._row('Scale',   this._xyz3('scl', scl.x, scl.y, scl.z))}
    `));

    /* ── Appearance ── */
    const col = obj.color || '#888888';
    let appHTML = this._row('Color', `<input type="color" class="insp-input" id="insp-color" value="${col}" style="max-width:60px"/>`);
    if (['zone','window','image-plane'].includes(obj.type)) {
      const op = obj.props?.opacity ?? 0.13;
      appHTML += this._row('Opacity', `<input type="range" id="insp-opacity" min="0" max="1" step="0.05" value="${op}"/>`);
    }
    S.push(this._sec('Appearance', appHTML));

    /* ── Dimensions (with metre labels) ── */
    const dimHTML = this._dimFields(obj);
    if (dimHTML) S.push(this._sec('Dimensions (m)', dimHTML));

    /* ── Info Point ── */
    if (obj.type === 'infopoint') {
      const lbl  = obj.props?.label       ?? '';
      const desc = obj.props?.description ?? '';
      S.push(this._sec('Info Point', `
        ${this._row('Label', this._txt('insp-ip-label', lbl))}
        <div style="margin-top:6px">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--text-2);margin-bottom:4px">Description</div>
          <textarea class="insp-textarea" id="insp-ip-desc" rows="4" placeholder="Enter description…">${this._esc(desc)}</textarea>
        </div>
      `));
      S.push(this._filesSection(obj));
    }

    /* ── Zone ── */
    if (obj.type === 'zone') {
      S.push(this._sec('Zone', `
        ${this._row('Label',   this._txt('insp-zone-label', obj.props?.label ?? ''))}
        ${this._row('Opacity', `<input type="range" id="insp-opacity" min="0" max="1" step="0.05" value="${obj.props?.opacity ?? 0.13}"/>`)}
      `));
    }

    /* ── 3D Label ── */
    if (obj.type === 'label3d') {
      S.push(this._sec('Label Text', `
        ${this._row('Text', this._txt('insp-lbl-text', obj.props?.text ?? ''))}
        ${this._row('Size m', `<input type="number" class="insp-input" id="insp-lbl-size" value="${obj.props?.size ?? 0.45}" step="0.05" min="0.1"/>`)}
      `));
    }

    /* ── Light ── */
    if (['point-light','spot-light'].includes(obj.type)) {
      S.push(this._sec('Light', `
        ${this._row('Intensity', `<input type="number" class="insp-input" id="insp-light-int"  value="${obj.props?.intensity ?? 1}"   step="0.1" min="0"/>`)}
        ${this._row('Dist m',    `<input type="number" class="insp-input" id="insp-light-dist" value="${obj.props?.distance ?? 10}"   step="0.5" min="0"/>`)}
      `));
    }

    /* ── Floor Line ── */
    if (obj.type === 'floorline') {
      S.push(this._sec('Floor Line', `
        ${this._row('Width m', `<input type="number" class="insp-input" id="insp-fl-width" value="${obj.props?.lineWidth ?? 0.08}" step="0.01" min="0.01"/>`)}
      `));
    }

    /* ── Actions ── */
    S.push(this._sec('Actions', `
      <label class="check-row" style="margin-bottom:6px">
        <input type="checkbox" id="insp-visible" ${obj.mesh?.visible !== false ? 'checked' : ''}> Visible in scene
      </label>
      <button class="insp-btn"         id="insp-btn-focus">⊙ Focus Camera</button>
      <button class="insp-btn primary" id="insp-btn-dup">⧉ Duplicate</button>
      <button class="insp-btn danger"  id="insp-btn-del">🗑 Delete Object</button>
    `));

    body.innerHTML = S.join('');
    this._bind(obj);
  },

  clear () {
    document.getElementById('inspector-body').innerHTML = `
      <div class="insp-empty">
        <div class="insp-empty-icon">↖</div>
        <p>No object selected</p>
        <small>Click any object in the viewport or scene tree</small>
      </div>`;
    const badge = document.getElementById('insp-type-badge');
    if (badge) { badge.textContent = '—'; badge.classList.remove('active'); }
  },

  /* Sync while dragging (called from renderer change event) */
  sync () {
    const obj = W3D.selectedObject;
    if (!obj?.mesh) return;
    const p = obj.mesh.position, r = obj.mesh.rotation, s = obj.mesh.scale;
    ['x','y','z'].forEach(a => {
      const pe = document.getElementById(`insp-pos-${a}`);
      const re = document.getElementById(`insp-rot-${a}`);
      const se = document.getElementById(`insp-scl-${a}`);
      if (pe) pe.value = this._f(p[a]);
      if (re) re.value = this._f(this._deg(r[a]));
      if (se) se.value = this._f(s[a]);
    });
  },

  /* ─── HTML builders ─────────────────────────── */

  _sec (title, body) {
    return `<div class="insp-section">
      <div class="insp-sec-header">${title}</div>
      <div class="insp-sec-body">${body}</div>
    </div>`;
  },

  _row (label, input) {
    return `<div class="insp-row">
      <span class="insp-lbl">${label}</span>${input}
    </div>`;
  },

  _txt (id, val) {
    return `<input class="insp-input" id="${id}" value="${this._esc(val)}"/>`;
  },

  _xyz3 (prefix, x, y, z) {
    return `<div class="insp-xyz">
      <div><input type="number" id="insp-${prefix}-x" value="${this._f(x)}" step="0.05"/><span class="insp-xyz-label">X</span></div>
      <div><input type="number" id="insp-${prefix}-y" value="${this._f(y)}" step="0.05"/><span class="insp-xyz-label">Y</span></div>
      <div><input type="number" id="insp-${prefix}-z" value="${this._f(z)}" step="0.05"/><span class="insp-xyz-label">Z</span></div>
    </div>`;
  },

  _dimFields (obj) {
    const p = obj.props || {};
    const n = (id, label, val, step=0.1) =>
      this._row(label, `<input type="number" class="insp-input" id="${id}" value="${this._f(val)}" step="${step}" min="0.01"/>`);
    switch (obj.type) {
      case 'wall': case 'floor': case 'ceiling': case 'box':
        return n('insp-dim-w','Width m',  p.width  ?? 1)
             + n('insp-dim-h','Height m', p.height ?? 1)
             + n('insp-dim-d','Depth m',  p.depth  ?? 1);
      case 'cylinder':
        return n('insp-dim-rt','Top R m',  p.radiusTop    ?? 0.5, 0.05)
             + n('insp-dim-rb','Bot R m',  p.radiusBottom ?? 0.5, 0.05)
             + n('insp-dim-h', 'Height m', p.height       ?? 1);
      case 'sphere':
        return n('insp-dim-r','Radius m', p.radius ?? 0.5, 0.05);
      case 'cone':
        return n('insp-dim-r','Radius m', p.radius ?? 0.5, 0.05)
             + n('insp-dim-h','Height m', p.height ?? 1);
      case 'plane': case 'image-plane':
        return n('insp-dim-w','Width m',  p.width  ?? 2)
             + n('insp-dim-h','Height m', p.height ?? 2);
      default: return null;
    }
  },

  _filesSection (obj) {
    const files = obj.files || [];
    let list = files.map((f,i) => `
      <div class="file-item">
        <span>📎</span>
        <span class="file-item-name">${this._esc(f.name)}</span>
        <button class="file-remove" data-idx="${i}">✕</button>
      </div>`).join('');
    return this._sec('Attachments', `
      <div class="file-list" id="insp-file-list">${list}</div>
      <button class="insp-btn primary" id="insp-btn-attach" style="margin-top:6px">＋ Attach File</button>
      <input type="file" id="insp-file-input" multiple style="display:none"/>
    `);
  },

  /* ─── Event binding ─────────────────────────── */

  _bind (obj) {
    const mesh = obj.mesh;

    /* Name */
    document.getElementById('insp-name')?.addEventListener('change', e => {
      obj.name = e.target.value;
      if (mesh) mesh.name = e.target.value;
      W3D.SceneTree.rebuild();
    });

    /* Position / Rotation / Scale */
    ['x','y','z'].forEach(a => {
      document.getElementById(`insp-pos-${a}`)?.addEventListener('input', e => {
        if (mesh) mesh.position[a] = parseFloat(e.target.value) || 0;
      });
      document.getElementById(`insp-rot-${a}`)?.addEventListener('input', e => {
        if (mesh) mesh.rotation[a] = THREE.MathUtils.degToRad(parseFloat(e.target.value) || 0);
      });
      document.getElementById(`insp-scl-${a}`)?.addEventListener('input', e => {
        if (mesh) mesh.scale[a] = Math.max(0.001, parseFloat(e.target.value) || 1);
      });
    });

    /* Color */
    document.getElementById('insp-color')?.addEventListener('input', e => {
      obj.color = e.target.value;
      if (obj.props) obj.props.color = e.target.value;
      if (mesh) W3D.applyColor(mesh, e.target.value);
    });

    /* Opacity */
    document.getElementById('insp-opacity')?.addEventListener('input', e => {
      const op = parseFloat(e.target.value);
      if (obj.props) obj.props.opacity = op;
      mesh?.traverse(c => { if (c.material && c.material.transparent) c.material.opacity = op; });
    });

    /* Visibility */
    document.getElementById('insp-visible')?.addEventListener('change', e => {
      if (mesh) mesh.visible = e.target.checked;
      W3D.SceneTree.rebuild();
    });

    /* Dimension rebuilds */
    const dim = (id, key) => {
      document.getElementById(id)?.addEventListener('change', e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v > 0) {
          if (obj.props) obj.props[key] = v;
          W3D.Factory.rebuildGeometry(obj);
        }
      });
    };
    dim('insp-dim-w',  'width');
    dim('insp-dim-h',  'height');
    dim('insp-dim-d',  'depth');
    dim('insp-dim-r',  'radius');
    dim('insp-dim-rt', 'radiusTop');
    dim('insp-dim-rb', 'radiusBottom');

    /* Info Point fields */
    document.getElementById('insp-ip-label')?.addEventListener('change', e => {
      obj.props.label = e.target.value;
      obj.name = e.target.value;
      W3D.SceneTree.rebuild();
    });
    document.getElementById('insp-ip-desc')?.addEventListener('input', e => {
      obj.props.description = e.target.value;
    });

    /* Zone */
    document.getElementById('insp-zone-label')?.addEventListener('change', e => {
      obj.props.label = e.target.value;
      obj.name = e.target.value;
      W3D.SceneTree.rebuild();
    });

    /* 3D Label */
    document.getElementById('insp-lbl-text')?.addEventListener('change', e => {
      obj.props.text = e.target.value;
      obj.name = 'Label: ' + e.target.value;
      W3D.Factory.rebuildLabel3d(obj);
      W3D.SceneTree.rebuild();
    });
    document.getElementById('insp-lbl-size')?.addEventListener('change', e => {
      obj.props.size = parseFloat(e.target.value) || 0.45;
      W3D.Factory.rebuildLabel3d(obj);
    });

    /* Light */
    document.getElementById('insp-light-int')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value) || 1;
      if (obj.props) obj.props.intensity = v;
      if (mesh?.isLight) mesh.intensity = v;
    });
    document.getElementById('insp-light-dist')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value) || 10;
      if (obj.props) obj.props.distance = v;
      if (mesh?.isLight) mesh.distance = v;
    });

    /* Floor line width */
    document.getElementById('insp-fl-width')?.addEventListener('change', e => {
      const v = parseFloat(e.target.value) || 0.08;
      if (obj.props) obj.props.lineWidth = v;
      // Rebuild floorline
      if (obj.mesh) { W3D.scene.remove(obj.mesh); W3D.disposeMesh(obj.mesh); }
      const rebuilt = W3D.Factory.floorLine(obj.props.points, obj.props);
      if (rebuilt) {
        W3D.objects.splice(W3D.objects.indexOf(rebuilt), 1); // remove duplicate
        obj.mesh = rebuilt.mesh;
      }
    });

    /* File attachments */
    document.getElementById('insp-btn-attach')?.addEventListener('click', () => {
      document.getElementById('insp-file-input')?.click();
    });
    document.getElementById('insp-file-input')?.addEventListener('change', e => {
      Array.from(e.target.files).forEach(f => this._attach(f, obj));
      e.target.value = '';
    });
    document.querySelectorAll('.file-remove').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        obj.files.splice(parseInt(btn.dataset.idx), 1);
        this.build(obj);
      });
    });

    /* Actions */
    document.getElementById('insp-btn-focus')?.addEventListener('click', () => W3D.Select.focus(obj));
    document.getElementById('insp-btn-dup')?.addEventListener('click',   () => W3D.Select.duplicate(obj));
    document.getElementById('insp-btn-del')?.addEventListener('click',   () => {
      W3D.Modal.confirm(`Delete "${obj.name}"?`, 'This action cannot be undone easily.', () => W3D.Select.deleteObject(obj));
    });
  },

  _attach (file, obj) {
    const reader = new FileReader();
    reader.onload = e => {
      obj.files = obj.files || [];
      obj.files.push({ name: file.name, type: file.type, data: e.target.result });
      this.build(obj);
      W3D.notify('Attached: ' + file.name);
    };
    reader.readAsDataURL(file);
  },

  _f   (v) { return parseFloat((+v).toFixed(3)); },
  _deg (r) { return this._f(THREE.MathUtils.radToDeg(r)); },
  _esc (s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};
