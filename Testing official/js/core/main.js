/* ═══════════════════════════════════════════════════════
   js/core/main.js
   Application entry point.
   Handles: auth, launch, keyboard shortcuts, viewport
   event routing, topbar buttons, context menu.
═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════════ */

document.getElementById('admin-login-btn').addEventListener('click', () => {
  const user = document.getElementById('inp-user').value.trim();
  const pass = document.getElementById('inp-pass').value;
  if (user === 'admin' && pass === '@dmin_pass') {
    _launch(true);
  } else {
    document.getElementById('login-err').textContent = 'Invalid username or password.';
  }
});

document.getElementById('inp-pass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('admin-login-btn').click();
});

document.getElementById('guest-btn').addEventListener('click', () => _launch(false));

document.getElementById('btn-exit').addEventListener('click', () => {
  W3D.Modal.confirm('Exit to Login', 'Return to the login screen?', () => {
    document.getElementById('app-screen').classList.remove('active');
    document.getElementById('login-screen').classList.add('active');
    document.body.classList.remove('guest');
  });
});

function _launch (isAdmin) {
  W3D.isAdmin = isAdmin;

  // Switch screens
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');

  // Apply role class (hides .admin-only elements for guests)
  if (!isAdmin) {
    document.body.classList.add('guest');
  } else {
    document.body.classList.remove('guest');
  }

  // Update badge
  const badge = document.getElementById('user-badge');
  badge.textContent = isAdmin ? 'ADMIN' : 'GUEST';
  badge.className   = 'user-badge' + (isAdmin ? ' admin' : '');

  // One-time Three.js init
  if (!W3D.renderer) {
    W3D.initRenderer();
    W3D.buildDemoScene();
    _initViewportEvents();
    _initTopbarEvents();
    W3D.Modal.init();
    W3D.Sidebar.init();
    W3D.SceneTree.init();
    W3D.InfoPoint.init();
    _initKeyboard();
  }

  W3D.SceneTree.rebuild();
  W3D.Inspector.clear();
}

/* ══════════════════════════════════════════════════════
   VIEWPORT EVENTS
══════════════════════════════════════════════════════ */

function _initViewportEvents () {
  const canvas = document.getElementById('three-canvas');

  /* ── Click ── */
  canvas.addEventListener('click', e => {
    if (e.button !== 0) return;
    _hideCtxMenu();

    // Drawing mode intercept
    if (W3D.isAdmin && W3D.draw.active) {
      W3D.Draw.handleClick(e);
      return;
    }

    // Info point click (works for all users)
    if (W3D.InfoPoint.handleClick(e)) return;

    // Object selection (admin only transform attach; guests just highlight)
    if (!W3D.draw.active) {
      const obj = W3D.getRaycastObject(e.clientX, e.clientY);
      if (obj) {
        W3D.Select.pick(obj);
      } else {
        W3D.Select.clear();
      }
    }
  });

  /* ── Double-click: finish drawing ── */
  canvas.addEventListener('dblclick', e => {
    if (W3D.isAdmin && W3D.draw.active) {
      W3D.Draw.handleDblClick(e);
    }
  });

  /* ── Mouse move: drawing preview + tooltip ── */
  canvas.addEventListener('mousemove', e => {
    if (W3D.isAdmin && W3D.draw.active) {
      W3D.Draw.handleMouseMove(e);
    }
    W3D.InfoPoint.handleMouseMove(e);
  });

  /* ── Right-click context menu (admin only) ── */
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!W3D.isAdmin) return;
    const obj = W3D.getRaycastObject(e.clientX, e.clientY);
    if (obj) {
      W3D.Select.pick(obj);
      _showCtxMenu(e.clientX, e.clientY);
    }
  });

  /* ── Hide context menu on click elsewhere ── */
  document.addEventListener('click', () => _hideCtxMenu());
}

/* ── Context menu ── */
function _showCtxMenu (x, y) {
  const menu = document.getElementById('ctx-menu');
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.classList.remove('hidden');
}
function _hideCtxMenu () {
  document.getElementById('ctx-menu').classList.add('hidden');
}

document.getElementById('ctx-duplicate').addEventListener('click', () => {
  if (W3D.selectedObject) W3D.Select.duplicate(W3D.selectedObject);
});
document.getElementById('ctx-focus').addEventListener('click', () => {
  W3D.Select.focus(W3D.selectedObject);
});
document.getElementById('ctx-delete').addEventListener('click', () => {
  if (W3D.selectedObject) {
    W3D.Modal.confirm(`Delete "${W3D.selectedObject.name}"?`, 'This cannot be undone easily.', () => {
      W3D.Select.deleteObject(W3D.selectedObject);
    });
  }
});

/* ══════════════════════════════════════════════════════
   TOPBAR BUTTONS
══════════════════════════════════════════════════════ */

function _initTopbarEvents () {
  /* View mode */
  document.getElementById('btn-view-persp').addEventListener('click', () => W3D.setViewMode('perspective'));
  document.getElementById('btn-view-top').addEventListener('click',   () => W3D.setViewMode('top'));

  /* Grid & snap */
  document.getElementById('btn-grid').addEventListener('click', W3D.toggleGrid.bind(W3D));

  document.getElementById('btn-snap').addEventListener('click', () => {
    W3D.snapEnabled = !W3D.snapEnabled;
    document.getElementById('btn-snap').classList.toggle('active', W3D.snapEnabled);
    document.getElementById('chk-snap').checked = W3D.snapEnabled;
    W3D.notify('Snap ' + (W3D.snapEnabled ? 'enabled' : 'disabled'));
  });

  /* Undo / Redo */
  document.getElementById('btn-undo').addEventListener('click', () => W3D.History.undo());
  document.getElementById('btn-redo').addEventListener('click', () => W3D.History.redo());

  /* Save / Load */
  document.getElementById('btn-save').addEventListener('click', () => W3D.Save.save());
  document.getElementById('btn-load').addEventListener('click', () => document.getElementById('inp-load-file').click());
  document.getElementById('inp-load-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => W3D.Save.load(ev.target.result);
    reader.readAsText(file);
    e.target.value = '';
  });

  /* Rename */
  document.getElementById('btn-rename').addEventListener('click', () => {
    W3D.Modal.prompt('Rename Scene', 'New scene name:', W3D.sceneName, name => {
      if (!name.trim()) return;
      W3D.sceneName = name.trim();
      document.getElementById('scene-name').textContent = W3D.sceneName;
      W3D.notify('Scene renamed');
    });
  });
}

/* ══════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════ */

function _initKeyboard () {
  window.addEventListener('keydown', e => {
    // Ignore when typing in inputs
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl) {
      if (e.key === 'z') { e.preventDefault(); W3D.History.undo(); }
      if (e.key === 'y') { e.preventDefault(); W3D.History.redo(); }
      if (e.key === 'd') { e.preventDefault(); if (W3D.selectedObject) W3D.Select.duplicate(W3D.selectedObject); }
      if (e.key === 's') { e.preventDefault(); if (W3D.isAdmin) W3D.Save.save(); }
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'delete':
      case 'backspace':
        if (W3D.isAdmin && W3D.selectedObject) W3D.Select.deleteSelected();
        break;
      case 'escape':
        if (W3D.draw.active) W3D.Draw.cancel();
        else W3D.Select.clear();
        break;
      case 'v': if (W3D.isAdmin) W3D.Select.setTool('select'); break;
      case 'r': if (W3D.isAdmin) W3D.Select.setTool('rotate'); break;
      case 's': if (W3D.isAdmin) W3D.Select.setTool('scale');  break;
      case 'f': W3D.Select.focus(W3D.selectedObject); break;
      case 'g': W3D.toggleGrid(); break;
    }
  });
}
