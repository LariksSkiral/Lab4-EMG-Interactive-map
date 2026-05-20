/* Transform tool – Blender-style move, rotate, and delete for loaded models.
   Move is locked to the XZ floor plane (horizontal).
   Rotate is locked to the Y axis (vertical spin).
  Keyboard: G = grab/move, R = rotate, Esc = deselect, Delete = remove selected object. */

W3D.Transform = {
  // Current tool mode: null | 'select' | 'move' | 'rotate'
  // Current tool mode: null | 'move' | 'rotate'
  mode: null,
  // Currently selected W3D.objects entry
  selected: null,
  // THREE.TransformControls instance
  controls: null,
  // Unrotated helper for world-axis translation gizmo
  _moveProxy: null,
  // Highlight outline helper
  _boxHelper: null,
  // Raycaster for picking objects
  _raycaster: new THREE.Raycaster(),
  _pointer: new THREE.Vector2(),
  // Highlighted materials cache (Xander-style)
  _highlighted: [],
  // Track transform drag state
  _isDragging: false,
  // Ignore the first click fired right after a gizmo drag ends
  _suppressNextClick: false,
  // Store the Y position of the model so we can lock it after transform
  _lockedY: 0,

  _forceWorldSpace() {
    if (!this.controls) return;
    if (this.controls.space !== 'world') {
      this.controls.setSpace('world');
    }
  },

  /* ── Bootstrap ─────────────────────────────────────────────────────────── */
  init() {
    // Create TransformControls
    const tc = new THREE.TransformControls(W3D.camera, W3D.renderer.domElement);
    tc.setSpace('world');
    tc.setSize(0.9);
    tc.translationSnap = 1;           // move in steps of 1 unit
    tc.rotationSnap = Math.PI / 180;  // rotate in steps of 1 degree by default
    W3D.scene.add(tc);
    this.controls = tc;

    // Proxy used in move mode so gizmo never inherits model rotation.
    this._moveProxy = new THREE.Object3D();
    this._moveProxy.name = '__w3d_move_proxy__';
    W3D.scene.add(this._moveProxy);

    // Keep translate handles in world space; rotate uses the stable default behavior.
    tc.addEventListener('change', () => {
      if (tc.mode === 'translate') this._forceWorldSpace();
    });

    // While dragging a gizmo, disable orbit so they don't fight
    tc.addEventListener('dragging-changed', e => {
      const wasDragging = this._isDragging;
      this._isDragging = e.value;
      if (!wasDragging && e.value && W3D.History) {
        W3D.History.beginTransform(this.selected);
      }
      if (wasDragging && !e.value) {
        // Browser emits a click after pointerup; suppress it so selection does not clear.
        this._suppressNextClick = true;
        if (W3D.History) {
          W3D.History.commitTransform(this.selected);
        }
      }
      W3D.orbitControls.enabled = !e.value;
    });

    // Keep the model on the floor while moving
    tc.addEventListener('objectChange', () => {
      if (!this.selected) return;
      if (tc.mode === 'translate') {
        // In move mode we drive selected object position from proxy (world-space axes).
        const source = (tc.object === this._moveProxy) ? this._moveProxy : this.selected.mesh;
        this.selected.mesh.position.x = source.position.x;
        this.selected.mesh.position.z = source.position.z;
        this.selected.mesh.position.y = this._lockedY;
        // Keep proxy synced and unrotated.
        this._moveProxy.position.copy(this.selected.mesh.position);
        this._moveProxy.rotation.set(0, 0, 0);
      }

      if (W3D.Database && typeof W3D.Database.markSceneDirty === 'function') {
        W3D.Database.markSceneDirty();
      }

      this._updateInfoStrip();
    });

    // Click picking (same event style as Xander)
    const canvas = W3D.renderer.domElement;
    canvas.addEventListener('click', e => this._onClick(e));

    // Keyboard shortcuts
    window.addEventListener('keydown', e => this._onKey(e));

    // Shift held while rotating → snap to 45° instead of 1°
    window.addEventListener('keydown', e => {
      if (e.key === 'Shift' && this.controls) {
        this.controls.rotationSnap = Math.PI / 4;
      }
    });
    window.addEventListener('keyup', e => {
      if (e.key === 'Shift' && this.controls) {
        this.controls.rotationSnap = Math.PI / 180;
      }
    });

    // Wire up taskbar buttons
    this._bindButtons();
  },

  /* ── Taskbar button wiring ─────────────────────────────────────────────── */
  _bindButtons() {
    const btnMove   = document.getElementById('btn-tool-move');
    const btnRotate = document.getElementById('btn-tool-rotate');
    const btnDelete = document.getElementById('btn-tool-delete');

    if (btnMove)   btnMove.addEventListener('click',   () => this.setMode('move'));
    if (btnRotate) btnRotate.addEventListener('click', () => this.setMode('rotate'));
    if (btnDelete) btnDelete.addEventListener('click', () => this.deleteSelected());

    this._updateButtons();
  },

  _updateButtons() {
    const btnMove   = document.getElementById('btn-tool-move');
    const btnRotate = document.getElementById('btn-tool-rotate');
    const btnDelete = document.getElementById('btn-tool-delete');
    const hasSelection = Boolean(this.selected);

    if (btnMove) {
      btnMove.disabled = !hasSelection;
      btnMove.classList.toggle('active', this.mode === 'move');
    }
    if (btnRotate) {
      btnRotate.disabled = !hasSelection;
      btnRotate.classList.toggle('active', this.mode === 'rotate');
    }
    if (btnDelete) {
      btnDelete.disabled = !hasSelection;
    }
  },

  /* ── Mode switching ────────────────────────────────────────────────────── */
  setMode(mode) {
    this.mode = mode;
    this._updateButtons();

    if (!this.selected) { this.controls.detach(); return; }

    if (mode === 'move') {
      this.controls.setMode('translate');
      this._forceWorldSpace();
      this.controls.showX = true;
      this.controls.showY = false;
      this.controls.showZ = true;
      // Attach to proxy so gizmo orientation stays world-aligned.
      this._moveProxy.position.copy(this.selected.mesh.position);
      this._moveProxy.rotation.set(0, 0, 0);
      this._moveProxy.scale.set(1, 1, 1);
      this.controls.attach(this._moveProxy);
    } else if (mode === 'rotate') {
      this.controls.setMode('rotate');
      this.controls.showX = false;
      this.controls.showY = true;
      this.controls.showZ = false;
      this.controls.attach(this.selected.mesh);
    } else {
      this.controls.detach();
    }
  },

  /* ── Selection ─────────────────────────────────────────────────────────── */
  select(obj) {
    // Deselect previous visual state first
    this._clearHighlight();

    this.selected = obj;
    this._lockedY = obj.mesh.position.y;

    // Show highlight (always visible and selection-synced)
    this._applyHighlight(obj.mesh);

    // Apply current mode's gizmo (keep existing mode if already set, else no gizmo)
    this.setMode(this.mode || null);

    // Update info strip
    this._updateInfoStrip();
  },

  deselect() {
    this.selected = null;
    this.controls.detach();
    this.mode = null;
    if (W3D.History) {
      W3D.History.clearPendingTransform();
    }
    this._clearHighlight();
    this._updateButtons();
    this._updateInfoStrip();
  },

  // Remove the currently selected object from the canvas.
  // Important: this only changes the editor scene immediately.
  // The user still needs to click Save so the database matches the canvas again.
  deleteSelected() {
    if (!this.selected) return false;

    const objectToDelete = this.selected;
    const objectIndex = W3D.objects.indexOf(objectToDelete);
    if (W3D.History) {
      W3D.History.recordDeletion(objectToDelete, objectIndex);
    }
    this.deselect();
    W3D.removeObject(objectToDelete);

    if (W3D.Database && typeof W3D.Database.markSceneDirty === 'function') {
      W3D.Database.markSceneDirty();
    }

    if (W3D.Database && typeof W3D.Database.setStatus === 'function') {
      W3D.Database.setStatus(
        `${objectToDelete.name} is uit de kaart verwijderd. Klik op Opslaan om deze wijziging te bewaren.`
      );
    }

    return true;
  },

  /* ── Highlight (Xander-style emissive) ─────────────────────────────────── */
  _applyHighlight(mesh) {
    this._highlighted = [];
    mesh.traverse(child => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => {
        if (!m.emissive) return;
        if (!m._origEmissive) m._origEmissive = m.emissive.clone();
        m.emissive.set(0xe8720c);
        m.emissiveIntensity = 0.32;
        this._highlighted.push(m);
      });
    });
  },

  _clearHighlight() {
    this._highlighted.forEach(m => {
      if (m._origEmissive) {
        m.emissive.copy(m._origEmissive);
        delete m._origEmissive;
      }
      m.emissiveIntensity = 0;
    });
    this._highlighted = [];
  },

  /* ── Info strip (shows selected object name + position) ────────────────── */
  _updateInfoStrip() {
    const strip = document.getElementById('transform-info');
    if (!strip) return;

    if (!this.selected) {
      strip.classList.add('is-hidden');
      return;
    }

    strip.classList.remove('is-hidden');
    const m = this.selected.mesh;
    const nameEl = document.getElementById('tf-obj-name');
    const posEl  = document.getElementById('tf-obj-pos');
    const rotEl  = document.getElementById('tf-obj-rot');
    if (nameEl) nameEl.textContent = this.selected.name;
    if (posEl)  posEl.textContent  = `X ${Math.round(m.position.x)}  Z ${Math.round(m.position.z)}`;
    if (rotEl)  rotEl.textContent  = `${Math.round(THREE.MathUtils.radToDeg(m.rotation.y))}°`;
  },

  /* ── Pointer handling (raycasting) ─────────────────────────────────────── */
  _onClick(e) {
    if (this._suppressNextClick) {
      this._suppressNextClick = false;
      return;
    }

    // Ignore click generated by a transform drag release
    if (this._isDragging) return;

    const rect = W3D.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Ensure all world matrices are up-to-date before raycasting
    W3D.scene.updateMatrixWorld(true);
    // Use the currently active camera so picking works in both 3D and top view
    this._raycaster.setFromCamera(this._pointer, W3D.activeCamera || W3D.camera);

    // Raycast only against selectable (non-static) objects
    const rootMeshes = W3D.objects.filter(o => !o.static).map(o => o.mesh);
    const hits = this._raycaster.intersectObjects(rootMeshes, true);

    if (hits.length > 0) {
      // Walk up the hit node's parent chain to find which W3D object owns it
      let node = hits[0].object;
      while (node) {
        const found = W3D.objects.find(o => o.mesh === node && !o.static);
        if (found) {
          this.select(found);
          return;
        }
        node = node.parent;
      }
    }

    // Clicked empty space – deselect
    this.deselect();
  },

  /* ── Keyboard shortcuts ────────────────────────────────────────────────── */
  _onKey(e) {
    // Don't intercept when typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (W3D.History) {
        W3D.History.undo();
      }
      return;
    }

    const key = e.key.toLowerCase();

    if (key === 'g') {
      e.preventDefault();
      this.setMode('move');
    } else if (key === 'r') {
      e.preventDefault();
      this.setMode('rotate');
    } else if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      this.deleteSelected();
    } else if (key === 'escape') {
      e.preventDefault();
      this.deselect();
    }
  },
};
