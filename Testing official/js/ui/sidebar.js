/* ═══════════════════════════════════════════════════════
   js/ui/sidebar.js
   Left sidebar: collapsible tab system + all create-button
   event wiring + tool buttons.
═══════════════════════════════════════════════════════ */

W3D.Sidebar = {

  init () {
    this._initTabs();
    this._initToolButtons();
    this._initCreateButtons();
    this._initSnapControls();
  },

  /* ── Collapsible tabs ── */
  _initTabs () {
    document.querySelectorAll('.stab-header').forEach(header => {
      header.addEventListener('click', () => {
        const key  = header.dataset.toggle;
        const body = document.getElementById('tab-' + key);
        if (!body) return;
        const isOpen = body.classList.contains('open');
        // Close all
        document.querySelectorAll('.stab-body').forEach(b => b.classList.remove('open'));
        document.querySelectorAll('.stab-header').forEach(h => h.classList.remove('open'));
        // Toggle clicked
        if (!isOpen) {
          body.classList.add('open');
          header.classList.add('open');
        }
      });
    });
    // Open Tools by default
    document.querySelector('[data-toggle="tools"]')?.classList.add('open');
    document.getElementById('tab-tools')?.classList.add('open');
  },

  /* ── Tool mode buttons ── */
  _initToolButtons () {
    ['select', 'rotate', 'scale'].forEach(tool => {
      document.getElementById('tool-' + tool)?.addEventListener('click', () => W3D.Select.setTool(tool));
    });

    document.getElementById('space-world')?.addEventListener('click', () => {
      W3D.transformControls?.setSpace('world');
      document.getElementById('space-world').classList.add('active');
      document.getElementById('space-local').classList.remove('active');
    });
    document.getElementById('space-local')?.addEventListener('click', () => {
      W3D.transformControls?.setSpace('local');
      document.getElementById('space-local').classList.add('active');
      document.getElementById('space-world').classList.remove('active');
    });
  },

  /* ── Snap controls ── */
  _initSnapControls () {
    document.getElementById('chk-snap')?.addEventListener('change', e => {
      W3D.snapEnabled = e.target.checked;
      document.getElementById('btn-snap')?.classList.toggle('active', W3D.snapEnabled);
    });
    document.getElementById('inp-snap-size')?.addEventListener('change', e => {
      W3D.snapSize = parseFloat(e.target.value) || 0.5;
    });
  },

  /* ── Create buttons ── */
  _initCreateButtons () {
    const F = W3D.Factory;
    const D = W3D.Draw;

    const simple = (fn) => () => { if (!W3D.isAdmin) return; const o = fn(); W3D.Select.pick(o); };

    /* Architecture */
    document.getElementById('c-wall')?.addEventListener('click', () => { if (W3D.isAdmin) D.start('wall'); });
    document.getElementById('c-floor')?.addEventListener('click', simple(() => F.floor()));
    document.getElementById('c-ceiling')?.addEventListener('click', simple(() => F.ceiling()));
    document.getElementById('c-door')?.addEventListener('click', simple(() => F.door()));
    document.getElementById('c-window')?.addEventListener('click', simple(() => F.window()));
    document.getElementById('c-staircase')?.addEventListener('click', simple(() => F.staircase()));
    document.getElementById('c-column')?.addEventListener('click', simple(() => F.column()));

    /* Primitives */
    document.getElementById('c-box')?.addEventListener('click', simple(() => F.box()));
    document.getElementById('c-cylinder')?.addEventListener('click', simple(() => F.cylinder()));
    document.getElementById('c-sphere')?.addEventListener('click', simple(() => F.sphere()));
    document.getElementById('c-cone')?.addEventListener('click', simple(() => F.cone()));
    document.getElementById('c-plane')?.addEventListener('click', simple(() => F.plane()));

    /* Lines & Zones */
    document.getElementById('c-floorline')?.addEventListener('click', () => { if (W3D.isAdmin) D.start('floorline'); });
    document.getElementById('c-zone')?.addEventListener('click', () => { if (W3D.isAdmin) D.start('zone'); });
    document.getElementById('c-arrow')?.addEventListener('click', simple(() => F.arrow()));

    /* Info & Labels */
    document.getElementById('c-infopoint')?.addEventListener('click', () => {
      if (!W3D.isAdmin) return;
      const o = F.infoPoint({ label: 'New Info Point', description: '', color: '#e8720c' });
      W3D.Select.pick(o);
      W3D.notify('Info Point created — edit label & description in Inspector');
    });
    document.getElementById('c-label3d')?.addEventListener('click', () => {
      if (!W3D.isAdmin) return;
      W3D.Modal.prompt('New 3D Label', 'Enter label text:', 'Label', text => {
        if (!text) return;
        const o = F.label3d({ text });
        W3D.Select.pick(o);
      });
    });
    document.getElementById('c-imageplane')?.addEventListener('click', simple(() => F.imagePlane()));

    /* 3D Models */
    document.getElementById('c-glb')?.addEventListener('click', () => {
      if (W3D.isAdmin) document.getElementById('inp-glb').click();
    });
    document.getElementById('inp-glb')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) F.loadGLB(file);
      e.target.value = '';
    });

    /* Lights */
    document.getElementById('c-point-light')?.addEventListener('click', () => {
      if (!W3D.isAdmin) return;
      const o = F.pointLight();
      W3D.Select.pick(o);
    });
    document.getElementById('c-spot-light')?.addEventListener('click', () => {
      if (!W3D.isAdmin) return;
      const o = F.spotLight();
      W3D.Select.pick(o);
    });
  },
};
