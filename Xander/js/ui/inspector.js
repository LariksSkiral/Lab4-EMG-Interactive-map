/* ═══════════════════════════════════════════════════════
   js/ui/inspector.js
   Right-side inspector panel: builds property forms for
   the selected object and applies live changes.
═══════════════════════════════════════════════════════ */

W3D.Inspector = {

  /* ── Build inspector for an object ── */
  build (obj) {
    const body  = document.getElementById('inspector-body');
    const badge = document.getElementById('insp-type-badge');

    if (!obj) { this.clear(); return; }

    badge.textContent = obj.type.toUpperCase();
    badge.classList.add('active');

    const sections = [];

    /* ── Object identity ── */
    sections.push(this._section('Object', `
      ${this._row('Name',  this._text('insp-name', obj.name))}
      ${this._row('Type',  `<span class="insp-input" style="background:none;border:none;color:var(--text-2)">${obj.type}</span>`)}
    `));

    /* ── Transform ── */
    const p = obj.mesh?.position ?? { x:0,y:0,z:0 };
    const r = obj.mesh ? {
      x: this._deg(obj.mesh.rotation.x),
      y: this._deg(obj.mesh.rotation.y),
      z: this._deg(obj.mesh.rotation.z),
    } : {x:0,y:0,z:0};
    const s = obj.mesh?.scale ?? {x:1,y:1,z:1};

    sections.push(this._section('Transform', `
      ${this._row('Pos',   this._xyz('pos', p.x, p.y, p.z))}
      ${this._row('Rot°',  this._xyz('rot', r.x, r.y, r.z))}
      ${this._row('Scale', this._xyz('scl', s.x, s.y, s.z))}
    `));

    /* ── Appearance ── */
    const colorVal = obj.color || '#888888';
    let appearBody = this._row('Color', `<input type="color" class="insp-input" id="insp-color" value="${colorVal}"/>`);
    if (['zone', 'window', 'image-plane'].includes(obj.type)) {
      const op = obj.props?.opacity ?? 1;
      appearBody += this._row('Opacity', `<input type="range" id="insp-opacity" min="0" max="1" step="0.05" value="${op}"/>`);
    }
    sections.push(this._section('Appearance', appearBody));

    /* ── Dimensions (type-specific) ── */
    const dimBody = this._buildDimensionFields(obj);
    if (dimBody) sections.push(this._section('Dimensions', dimBody));

    /* ── Info Point fields ── */
    if (obj.type === 'infopoint') {
      sections.push(this._section('Info Point', `
        ${this._row('Label', this._text('insp-ip-label', obj.props?.label ?? ''))}
        <div class="insp-row" style="flex-direction:column;gap:4px">
          <span class="insp-lbl" style="width:auto">Description</span>
          <textarea class="insp-textarea" id="insp-ip-desc" rows="5" placeholder="Enter description…">${this._esc(obj.props?.description ?? '')}</textarea>
        </div>
      `));
      sections.push(this._buildFilesSection(obj));
    }

    /* ── Zone ── */
    if (obj.type === 'zone') {
      sections.push(this._section('Zone', `
        ${this._row('Label', this._text('insp-zone-label', obj.props?.label ?? ''))}
      `));
    }

    /* ── 3D Label ── */
    if (obj.type === 'label3d') {
      sections.push(this._section('Label', `
        ${this._row('Text', this._text('insp-lbl-text', obj.props?.text ?? ''))}
        ${this._row('Size', `<input type="number" class="insp-input" id="insp-lbl-size" value="${obj.props?.size ?? 0.45}" step="0.05" min="0.1"/>`)}
      `));
    }

    /* ── Light ── */
    if (['point-light', 'spot-light'].includes(obj.type)) {
      sections.push(this._section('Light', `
        ${this._row('Intensity', `<input type="number" class="insp-input" id="insp-light-int" value="${obj.props?.intensity ?? 1}" step="0.1" min="0"/>`)}
        ${this._row('Distance',  `<input type="number" class="insp-input" id="insp-light-dist" value="${obj.props?.distance ?? 10}" step="0.5" min="0"/>`)}
      `));
    }

    /* ── Actions ── */
    sections.push(this._section('Actions', `
      <label class="check-row" style="margin-bottom:4px">
        <input type="checkbox" id="insp-visible" ${obj.mesh?.visible !== false ? 'checked' : ''}> Visible
      </label>
      <button class="insp-btn" id="insp-btn-focus">⊙ Focus Camera</button>
      <button class="insp-btn primary" id="insp-btn-dup">⧉ Duplicate</button>
      <button class="insp-btn danger"  id="insp-btn-del">🗑 Delete Object</button>
    `));

    body.innerHTML = sections.join('');
    this._bind(obj);
  },

  /* ── Clear inspector (no selection) ── */
  clear () {
    document.getElementById('inspector-body').innerHTML = `
      <div class="insp-empty">
        <div class="insp-empty-icon">↖</div>
        <p>No object selected</p>
        <small>Click an object in the viewport or scene tree</small>
      </div>`;
    const badge = document.getElementById('insp-type-badge');
    badge.textContent = '—';
    badge.classList.remove('active');
  },

  /* ── Sync transform values (called while dragging) ── */
  sync () {
    const obj = W3D.selectedObject;
    if (!obj?.mesh) return;
    const p = obj.mesh.position, r = obj.mesh.rotation, s = obj.mesh.scale;
    const get = id => document.getElementById(id);
    ['x','y','z'].forEach((a,i) => {
      get('insp-pos-' + a)?.setAttribute('value', this._f(p[a]));
      get('insp-pos-' + a) && (get('insp-pos-' + a).value = this._f(p[a]));
      get('insp-rot-' + a) && (get('insp-rot-' + a).value = this._f(this._deg(r[a])));
      get('insp-scl-' + a) && (get('insp-scl-' + a).value = this._f(s[a]));
    });
  },

  /* ─── Private builders ─────────────────────── */

  _section (title, body) {
    return `<div class="insp-section">
      <div class="insp-sec-header">${title}</div>
      <div class="insp-sec-body">${body}</div>
    </div>`;
  },

  _row (label, input) {
    return `<div class="insp-row"><span class="insp-lbl">${label}</span>${input}</div>`;
  },

  _text (id, val) {
    return `<input class="insp-input" id="${id}" value="${this._esc(val)}"/>`;
  },

  _xyz (prefix, x, y, z) {
    return `<div class="insp-xyz">
      <div><input type="number" id="insp-${prefix}-x" value="${this._f(x)}" step="0.01"/><span class="insp-xyz-label">X</span></div>
      <div><input type="number" id="insp-${prefix}-y" value="${this._f(y)}" step="0.01"/><span class="insp-xyz-label">Y</span></div>
      <div><input type="number" id="insp-${prefix}-z" value="${this._f(z)}" step="0.01"/><span class="insp-xyz-label">Z</span></div>
    </div>`;
  },

  _buildDimensionFields (obj) {
    const p = obj.props || {};
    switch (obj.type) {
      case 'wall': case 'box': case 'floor': case 'ceiling':
        return `
          ${this._row('Width',  `<input type="number" class="insp-input" id="insp-dim-w" value="${p.width  ?? 1}" step="0.1" min="0.01"/>`)}
          ${this._row('Height', `<input type="number" class="insp-input" id="insp-dim-h" value="${p.height ?? 1}" step="0.1" min="0.01"/>`)}
          ${this._row('Depth',  `<input type="number" class="insp-input" id="insp-dim-d" value="${p.depth  ?? 1}" step="0.1" min="0.01"/>`)}`;
      case 'cylinder':
        return `
          ${this._row('Top R',   `<input type="number" class="insp-input" id="insp-dim-rt" value="${p.radiusTop    ?? 0.5}" step="0.05" min="0.01"/>`)}
          ${this._row('Bot R',   `<input type="number" class="insp-input" id="insp-dim-rb" value="${p.radiusBottom ?? 0.5}" step="0.05" min="0.01"/>`)}
          ${this._row('Height',  `<input type="number" class="insp-input" id="insp-dim-h"  value="${p.height        ?? 1  }" step="0.1"  min="0.01"/>`)}`;
      case 'sphere':
        return this._row('Radius', `<input type="number" class="insp-input" id="insp-dim-r" value="${p.radius ?? 0.5}" step="0.05" min="0.01"/>`);
      case 'cone':
        return `
          ${this._row('Radius', `<input type="number" class="insp-input" id="insp-dim-r" value="${p.radius ?? 0.5}" step="0.05" min="0.01"/>`)}
          ${this._row('Height', `<input type="number" class="insp-input" id="insp-dim-h" value="${p.height ?? 1}"   step="0.1"  min="0.01"/>`)}`;
      case 'plane': case 'image-plane':
        return `
          ${this._row('Width',  `<input type="number" class="insp-input" id="insp-dim-w" value="${p.width  ?? 2}" step="0.1" min="0.01"/>`)}
          ${this._row('Height', `<input type="number" class="insp-input" id="insp-dim-h" value="${p.height ?? 2}" step="0.1" min="0.01"/>`)}`;
      default: return null;
    }
  },

  _buildFilesSection (obj) {
    const files = obj.files || [];
    let listHTML = '';
    files.forEach((f, i) => {
      listHTML += `<div class="file-item">
        <span>📎</span>
        <span class="file-item-name">${this._esc(f.name)}</span>
        <button class="file-remove" data-idx="${i}" title="Remove">✕</button>
      </div>`;
    });
    return this._section('Attachments', `
      <div class="file-list" id="insp-file-list">${listHTML}</div>
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

    /* Position */
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
      obj.props.color = e.target.value;
      if (mesh) W3D.applyColor(mesh, e.target.value);
    });

    /* Opacity */
    document.getElementById('insp-opacity')?.addEventListener('input', e => {
      const op = parseFloat(e.target.value);
      obj.props.opacity = op;
      mesh?.traverse(c => { if (c.material) c.material.opacity = op; });
    });

    /* Visibility */
    document.getElementById('insp-visible')?.addEventListener('change', e => {
      if (mesh) mesh.visible = e.target.checked;
      W3D.SceneTree.rebuild();
    });

    /* Dimensions */
    const dim = (id, key, parser = parseFloat) => {
      document.getElementById(id)?.addEventListener('change', e => {
        obj.props[key] = parser(e.target.value) || obj.props[key];
        W3D.Factory.rebuildGeometry(obj);
      });
    };
    dim('insp-dim-w', 'width');
    dim('insp-dim-h', 'height');
    dim('insp-dim-d', 'depth');
    dim('insp-dim-r', 'radius');
    dim('insp-dim-rt','radiusTop');
    dim('insp-dim-rb','radiusBottom');

    /* Info point */
    document.getElementById('insp-ip-label')?.addEventListener('change', e => {
      obj.props.label = e.target.value;
      obj.name = e.target.value;
      W3D.SceneTree.rebuild();
    });
    document.getElementById('insp-ip-desc')?.addEventListener('input', e => {
      obj.props.description = e.target.value;
    });

    /* Zone label */
    document.getElementById('insp-zone-label')?.addEventListener('change', e => {
      obj.props.label = e.target.value;
      obj.name = e.target.value;
      W3D.SceneTree.rebuild();
    });

    /* 3D label */
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
      obj.props.intensity = v;
      if (mesh?.isLight) mesh.intensity = v;
    });
    document.getElementById('insp-light-dist')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value) || 10;
      obj.props.distance = v;
      if (mesh?.isLight) mesh.distance = v;
    });

    /* File attachments */
    document.getElementById('insp-btn-attach')?.addEventListener('click', () => {
      document.getElementById('insp-file-input')?.click();
    });
    document.getElementById('insp-file-input')?.addEventListener('change', e => {
      Array.from(e.target.files).forEach(f => this._attachFile(f, obj));
      e.target.value = '';
    });
    document.querySelectorAll('.file-remove').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        obj.files.splice(parseInt(btn.dataset.idx), 1);
        this.build(obj);
      });
    });

    /* Action buttons */
    document.getElementById('insp-btn-focus')?.addEventListener('click', () => W3D.Select.focus(obj));
    document.getElementById('insp-btn-dup')?.addEventListener('click',   () => W3D.Select.duplicate(obj));
    document.getElementById('insp-btn-del')?.addEventListener('click',   () => {
      W3D.Modal.confirm(`Delete "${obj.name}"?`, 'This action cannot easily be undone.', () => W3D.Select.deleteObject(obj));
    });
  },

  _attachFile (file, obj) {
    const reader = new FileReader();
    reader.onload = e => {
      obj.files = obj.files || [];
      obj.files.push({ name: file.name, type: file.type, data: e.target.result });
      this.build(obj);
      W3D.notify('Attached: ' + file.name);
    };
    reader.readAsDataURL(file);
  },

  /* ── Utilities ── */
  _f   (v) { return parseFloat((+v).toFixed(3)); },
  _deg (r) { return this._f(THREE.MathUtils.radToDeg(r)); },
  _esc (s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },
};
