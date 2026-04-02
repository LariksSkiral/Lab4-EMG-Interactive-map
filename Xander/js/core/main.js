/* ═══════════════════════════════════════════════════════
   js/core/main.js
   App entry point: loading screen, auth (flyout login),
   viewport events, topbar, keyboard shortcuts,
   "Set Default" export, Floorplan AI import.
═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   LOADING SCREEN  →  AUTO-LAUNCH AS GUEST
══════════════════════════════════════════════════════ */

var LOADER_STEPS = [
  { pct: 15,  msg: 'Loading Three.js renderer...' },
  { pct: 35,  msg: 'Building scene geometry...'   },
  { pct: 60,  msg: 'Placing objects...'           },
  { pct: 80,  msg: 'Setting up lighting...'       },
  { pct: 95,  msg: 'Almost ready...'              },
  { pct: 100, msg: 'Done!'                        },
];

function _runLoader() {
  var bar    = document.getElementById('loader-bar');
  var status = document.getElementById('loader-status');
  if (!bar || !status) { _launch(false); return; }

  var step   = 0;
  var delays = [300, 350, 500, 500, 600, 400];

  function tick() {
    if (step >= LOADER_STEPS.length) {
      var ls = document.getElementById('loading-screen');
      if (ls) {
        ls.style.transition = 'opacity 0.45s ease';
        ls.style.opacity    = '0';
        setTimeout(function() {
          ls.classList.remove('active');
          ls.style.display = 'none';
          _launch(false);
        }, 460);
      } else {
        _launch(false);
      }
      return;
    }
    var s           = LOADER_STEPS[step];
    bar.style.width    = s.pct + '%';
    status.textContent = s.msg;
    var delay = delays[step] || 400;
    step++;
    setTimeout(tick, delay);
  }

  setTimeout(tick, 200);
}

window.addEventListener('DOMContentLoaded', _runLoader);


/* ══════════════════════════════════════════════════════
   LAUNCH
══════════════════════════════════════════════════════ */

var _appBooted = false;

function _launch(isAdmin) {
  W3D.isAdmin = isAdmin;

  var appEl = document.getElementById('app-screen');
  if (appEl) appEl.classList.add('active');

  if (isAdmin) {
    document.body.classList.remove('guest');
    document.body.classList.add('admin');
  } else {
    document.body.classList.add('guest');
    document.body.classList.remove('admin');
  }

  var loginBtn = document.getElementById('btn-show-login');
  if (loginBtn) loginBtn.style.display = isAdmin ? 'none' : '';

  if (!_appBooted) {
    _appBooted = true;
    W3D.initRenderer();

    // Grid off by default (guest view)
    if (W3D.gridHelper) W3D.gridHelper.visible = false;
    var gridBtn = document.getElementById('btn-grid');
    if (gridBtn) gridBtn.classList.remove('active');

    W3D.buildDemoScene();
    _initViewportEvents();
    _initTopbarEvents();
    W3D.Modal.init();
    W3D.Sidebar.init();
    W3D.SceneTree.init();
    W3D.InfoPoint.init();
    _initKeyboard();
    _initFlyout();
  }

  // Turn grid on when admin logs in
  if (isAdmin && W3D.gridHelper) {
    W3D.gridHelper.visible = true;
    var gb = document.getElementById('btn-grid');
    if (gb) gb.classList.add('active');
  }

  W3D.SceneTree.rebuild();
  if (isAdmin) W3D.Inspector.clear();
}


/* ══════════════════════════════════════════════════════
   ADMIN LOGIN FLYOUT
══════════════════════════════════════════════════════ */

function _initFlyout() {
  var flyout  = document.getElementById('login-flyout');
  var showBtn = document.getElementById('btn-show-login');

  if (showBtn) {
    showBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!flyout) return;
      flyout.classList.toggle('hidden');
      if (!flyout.classList.contains('hidden')) {
        var u = document.getElementById('inp-user');
        if (u) u.focus();
      }
    });
  }

  document.addEventListener('click', function(e) {
    if (!flyout || flyout.classList.contains('hidden')) return;
    if (!flyout.contains(e.target) && e.target !== showBtn) {
      flyout.classList.add('hidden');
    }
  });

  var loginBtn = document.getElementById('admin-login-btn');
  var passEl   = document.getElementById('inp-pass');
  if (loginBtn) loginBtn.addEventListener('click', _doAdminLogin);
  if (passEl)   passEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') _doAdminLogin();
  });

  var logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      W3D.Modal.confirm('Log out', 'Return to guest view?', function() {
        W3D.isAdmin = false;
        W3D.Select.clear();
        document.body.classList.remove('admin');
        document.body.classList.add('guest');
        if (showBtn) showBtn.style.display = '';
        // Hide grid when returning to guest
        if (W3D.gridHelper) W3D.gridHelper.visible = false;
        var gb2 = document.getElementById('btn-grid');
        if (gb2) gb2.classList.remove('active');
        W3D.notify('Logged out');
      });
    });
  }
}

function _doAdminLogin() {
  var userEl = document.getElementById('inp-user');
  var passEl = document.getElementById('inp-pass');
  var errEl  = document.getElementById('login-err');
  var user   = userEl ? userEl.value.trim() : '';
  var pass   = passEl ? passEl.value        : '';

  if (user === 'admin' && pass === '@dmin_pass') {
    var flyout = document.getElementById('login-flyout');
    if (flyout)  flyout.classList.add('hidden');
    if (errEl)   errEl.textContent = '';
    if (passEl)  passEl.value = '';
    _launch(true);
    W3D.notify('Welcome back, Admin!', 'success');
  } else {
    if (errEl)  errEl.textContent = 'Incorrect username or password.';
    if (passEl) passEl.select();
  }
}


/* ══════════════════════════════════════════════════════
   VIEWPORT EVENTS
══════════════════════════════════════════════════════ */

function _initViewportEvents() {
  var canvas = document.getElementById('three-canvas');
  if (!canvas) return;

  canvas.addEventListener('click', function(e) {
    if (e.button !== 0) return;
    _hideCtxMenu();

    // Suppress click fired right after a transform-controls drag ends
    if (W3D._dragActive) return;

    if (W3D.isAdmin && W3D.draw.active) {
      W3D.Draw.handleClick(e);
      return;
    }

    // Info point popup works for all users
    if (W3D.InfoPoint.handleClick(e)) return;

    var obj = W3D.getRaycastObject(e.clientX, e.clientY);
    if (obj) {
      W3D.Select.pick(obj);
    } else {
      W3D.Select.clear();
    }
  });

  canvas.addEventListener('dblclick', function(e) {
    if (W3D.isAdmin && W3D.draw.active) W3D.Draw.handleDblClick(e);
  });

  canvas.addEventListener('mousemove', function(e) {
    if (W3D.isAdmin && W3D.draw.active) W3D.Draw.handleMouseMove(e);
    W3D.InfoPoint.handleMouseMove(e);
  });

  canvas.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    if (!W3D.isAdmin) return;
    var obj = W3D.getRaycastObject(e.clientX, e.clientY);
    if (obj) {
      W3D.Select.pick(obj);
      _showCtxMenu(e.clientX, e.clientY);
    }
  });

  document.addEventListener('click', function() { _hideCtxMenu(); });
}

function _showCtxMenu(x, y) {
  var menu = document.getElementById('ctx-menu');
  if (!menu) return;
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.classList.remove('hidden');
}
function _hideCtxMenu() {
  var menu = document.getElementById('ctx-menu');
  if (menu) menu.classList.add('hidden');
}

document.getElementById('ctx-duplicate').addEventListener('click', function() {
  if (W3D.selectedObject) W3D.Select.duplicate(W3D.selectedObject);
});
document.getElementById('ctx-focus').addEventListener('click', function() {
  W3D.Select.focus(W3D.selectedObject);
});
document.getElementById('ctx-delete').addEventListener('click', function() {
  if (!W3D.selectedObject) return;
  W3D.Modal.confirm(
    'Delete "' + W3D.selectedObject.name + '"?',
    'This cannot be undone easily.',
    function() { W3D.Select.deleteObject(W3D.selectedObject); }
  );
});


/* ══════════════════════════════════════════════════════
   TOPBAR BUTTONS
══════════════════════════════════════════════════════ */

function _initTopbarEvents() {
  function on(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  on('btn-view-persp', function() { W3D.setViewMode('perspective'); });
  on('btn-view-top',   function() { W3D.setViewMode('top'); });
  on('btn-grid',       function() { W3D.toggleGrid(); });

  on('btn-snap', function() {
    W3D.snapEnabled = !W3D.snapEnabled;
    var el = document.getElementById('btn-snap');
    if (el) el.classList.toggle('active', W3D.snapEnabled);
    var chk = document.getElementById('chk-snap');
    if (chk) chk.checked = W3D.snapEnabled;
    W3D.notify('Snap ' + (W3D.snapEnabled ? 'enabled' : 'disabled'));
  });

  on('btn-undo',  function() { W3D.History.undo(); });
  on('btn-redo',  function() { W3D.History.redo(); });
  on('btn-save',  function() { W3D.Save.save(); });

  on('btn-load', function() {
    var inp = document.getElementById('inp-load-file');
    if (inp) inp.click();
  });

  var loadFile = document.getElementById('inp-load-file');
  if (loadFile) loadFile.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) { W3D.Save.load(ev.target.result); };
    reader.readAsText(file);
    e.target.value = '';
  });

  on('btn-rename', function() {
    W3D.Modal.prompt('Rename Scene', 'New scene name:', W3D.sceneName, function(name) {
      if (!name.trim()) return;
      W3D.sceneName = name.trim();
      var sn = document.getElementById('scene-name');
      if (sn) sn.textContent = W3D.sceneName;
      W3D.notify('Scene renamed');
    });
  });

  on('btn-set-default', function() {
    W3D.Modal.confirm(
      'Set as Default Scene',
      'This downloads a new demo.js containing the current scene. Replace js/objects/demo.js with it to change what loads on startup.',
      _saveAsDefault
    );
  });

  on('btn-floorplan-ai', function() {
    var inp = document.getElementById('inp-floorplan-img');
    if (inp) inp.click();
  });

  var fpInput = document.getElementById('inp-floorplan-img');
  if (fpInput) fpInput.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (file) _processFloorplan(file);
    e.target.value = '';
  });
}


/* ══════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════ */

function _initKeyboard() {
  window.addEventListener('keydown', function(e) {
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

    var ctrl = e.ctrlKey || e.metaKey;
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
        var flyout = document.getElementById('login-flyout');
        if (flyout) flyout.classList.add('hidden');
        break;
      case 'v': if (W3D.isAdmin) W3D.Select.setTool('select'); break;
      case 'r': if (W3D.isAdmin) W3D.Select.setTool('rotate'); break;
      case 's': if (W3D.isAdmin) W3D.Select.setTool('scale');  break;
      case 'f': W3D.Select.focus(W3D.selectedObject); break;
      case 'g': if (W3D.isAdmin) W3D.toggleGrid(); break;
    }
  });
}


/* ══════════════════════════════════════════════════════
   SET AS DEFAULT SCENE
   Generates and downloads a new demo.js from current state.
══════════════════════════════════════════════════════ */

function _saveAsDefault() {
  var lines = [];
  lines.push('/* AUTO-GENERATED by Workspace3D "Set Default" — ' + new Date().toISOString() + ' */');
  lines.push('/* Drop this file into js/objects/demo.js to change the startup scene. */');
  lines.push('');
  lines.push('W3D.buildDemoScene = function () {');
  lines.push('  var F = W3D.Factory;');
  lines.push('');

  W3D.objects.forEach(function(obj, i) {
    if (!obj.mesh) return;
    var pos = obj.mesh.position;
    var rot = obj.mesh.rotation;
    var scl = obj.mesh.scale;
    var pr  = obj.props || {};
    var v   = '_o' + i;
    var call = null;

    switch (obj.type) {
      case 'wall': {
        var hw  = (pr.width || 4) / 2;
        var ang = rot.y;
        var sx  = pos.x - Math.cos(ang) * hw;
        var sz  = pos.z + Math.sin(ang) * hw;
        var ex  = pos.x + Math.cos(ang) * hw;
        var ez  = pos.z - Math.sin(ang) * hw;
        call = 'F.wallFromPoints({x:' + _ff(sx) + ',z:' + _ff(sz) + '},{x:' + _ff(ex) + ',z:' + _ff(ez) + '},'
          + JSON.stringify({height: pr.height||3, depth: pr.depth||0.2, color: obj.color}) + ')';
        break;
      }
      case 'floor':
        call = 'F.floor(' + JSON.stringify({width: pr.width||6, depth: pr.depth||6, color: obj.color}) + ')';
        break;
      case 'door':
        call = 'F.door(' + JSON.stringify({width: pr.width||1, height: pr.height||2.2, color: obj.color}) + ')';
        break;
      case 'floorline':
        if (pr.points && pr.points.length >= 2)
          call = 'F.floorLine(' + JSON.stringify(pr.points) + ',' + JSON.stringify({color: obj.color, lineWidth: pr.lineWidth||0.08}) + ')';
        break;
      case 'zone':
        if (pr.points && pr.points.length >= 3)
          call = 'F.zone(' + JSON.stringify(pr.points) + ',' + JSON.stringify({color: obj.color, opacity: pr.opacity||0.13, label: obj.name}) + ')';
        break;
      case 'infopoint':
        call = 'F.infoPoint(' + JSON.stringify({label: pr.label||obj.name, description: pr.description||'', color: obj.color}) + ')';
        break;
      case 'label3d':
        call = 'F.label3d(' + JSON.stringify({text: pr.text||'Label', color: obj.color, size: pr.size||0.45}) + ')';
        break;
      case 'point-light':
        call = 'F.pointLight(' + JSON.stringify({color: obj.color, intensity: pr.intensity||1.2, distance: pr.distance||12}) + ')';
        break;
    }
    if (!call) return;

    lines.push('  // ' + obj.name);
    lines.push('  var ' + v + ' = ' + call + ';');
    lines.push('  if (' + v + ' && ' + v + '.mesh) {');
    lines.push('    ' + v + '.name = ' + JSON.stringify(obj.name) + ';');
    lines.push('    ' + v + '.mesh.position.set(' + _ff(pos.x) + ',' + _ff(pos.y) + ',' + _ff(pos.z) + ');');
    lines.push('    ' + v + '.mesh.rotation.set(' + _ff(rot.x) + ',' + _ff(rot.y) + ',' + _ff(rot.z) + ');');
    if (scl.x !== 1 || scl.y !== 1 || scl.z !== 1)
      lines.push('    ' + v + '.mesh.scale.set(' + _ff(scl.x) + ',' + _ff(scl.y) + ',' + _ff(scl.z) + ');');
    lines.push('  }');
    lines.push('');
  });

  lines.push('  W3D.SceneTree.rebuild();');
  lines.push('};');

  var code = lines.join('\n');
  var blob = new Blob([code], {type: 'text/javascript'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'demo.js';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  W3D.notify('demo.js downloaded — replace js/objects/demo.js with this file', 'success');
}

function _ff(v) { return parseFloat((+v).toFixed(4)); }


/* ══════════════════════════════════════════════════════
   FLOORPLAN AI IMPORT
══════════════════════════════════════════════════════ */

function _processFloorplan(file) {
  W3D.notify('Reading floorplan image...', 'warn');
  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    W3D.Modal.show(
      'Floorplan AI Import',
      '<div style="margin-bottom:12px">' +
        '<img src="' + dataUrl + '" style="max-width:100%;max-height:180px;border-radius:6px;border:1px solid var(--border);display:block;margin:0 auto"/>' +
      '</div>' +
      '<p style="margin-bottom:10px;font-size:12px;color:var(--text-1)">The AI will detect walls, rooms and spaces from your floorplan image and import them into the scene.</p>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:8px">' +
        '<input type="checkbox" id="fp-keep" checked/> Keep existing scene objects' +
      '</label>' +
      '<div style="display:flex;align-items:center;gap:8px;font-size:12px">' +
        '<span>Scale: 1 pixel =</span>' +
        '<input type="number" id="fp-scale" value="0.05" step="0.01" min="0.001" style="width:64px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-0)"/>' +
        '<span>metres</span>' +
      '</div>',
      [
        { label: 'Cancel' },
        { label: 'Analyse & Import', cls: 'primary', action: function() {
          var keepEl  = document.getElementById('fp-keep');
          var scaleEl = document.getElementById('fp-scale');
          var keep  = keepEl  ? keepEl.checked                    : true;
          var scale = scaleEl ? parseFloat(scaleEl.value) || 0.05 : 0.05;
          _runFloorplanAnalysis(dataUrl, scale, keep);
        }}
      ]
    );
  };
  reader.readAsDataURL(file);
}

function _runFloorplanAnalysis(dataUrl, scale, keepExisting) {
  W3D.notify('Analysing floorplan — this may take a moment...', 'warn');
  _analyseWithClaude(dataUrl, scale, keepExisting);
}

function _analyseWithClaude(dataUrl, scale, keepExisting) {
  var parts     = dataUrl.split(',');
  var header    = parts[0] || '';
  var b64       = parts[1] || '';
  var mimeMatch = header.match(/data:(.*);/);
  var mimeType  = mimeMatch ? mimeMatch[1] : 'image/png';

  var prompt = [
    'You are analysing a 2D architectural floorplan image. Extract all walls and rooms.',
    '',
    'Return ONLY a valid JSON object (no markdown, no code fences, no explanation) with this exact structure:',
    '{',
    '  "walls": [',
    '    {"x1": <number>, "z1": <number>, "x2": <number>, "z2": <number>, "thickness": <number>}',
    '  ],',
    '  "zones": [',
    '    {"label": "<room name>", "points": [{"x": <number>, "z": <number>}], "color": "<hex>"}',
    '  ],',
    '  "info_points": [',
    '    {"label": "<name>", "description": "<desc>", "x": <number>, "z": <number>}',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Coordinates in metres. Assume standard room sizes (bedroom ~4x4m, corridor ~1.5m).',
    '- Map pixel positions to metre coords, top-left = origin (0,0).',
    '- Trace every wall as start/end pair.',
    '- Create a closed polygon per room.',
    '- One info_point per room at its centre.',
    '- Use distinct light hex colors for zones.',
    '- Return ONLY the JSON, nothing else.'
  ].join('\n');

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } },
          { type: 'text',  text: prompt }
        ]
      }]
    })
  })
  .then(function(resp) {
    if (!resp.ok) throw new Error('API ' + resp.status);
    return resp.json();
  })
  .then(function(data) {
    var text = (data.content || []).map(function(c) { return c.text || ''; }).join('');
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    var parsed = JSON.parse(jsonMatch[0]);
    _applyFloorplanData(parsed, scale, keepExisting);
  })
  .catch(function(err) {
    console.warn('Claude API floorplan analysis failed:', err);
    W3D.notify('AI analysis unavailable — using edge-detection fallback', 'warn');
    _edgeDetectionFallback(dataUrl, scale, keepExisting);
  });
}

function _applyFloorplanData(data, scale, keepExisting) {
  if (!keepExisting) {
    W3D.objects.forEach(function(o) {
      if (o.mesh) { W3D.scene.remove(o.mesh); W3D.disposeMesh(o.mesh); }
    });
    W3D.objects = [];
  }

  var F     = W3D.Factory;
  var count = 0;

  (data.walls || []).forEach(function(w) {
    var s = { x: w.x1 * scale, z: w.z1 * scale };
    var e = { x: w.x2 * scale, z: w.z2 * scale };
    var obj = F.wallFromPoints(s, e, { height: 3, depth: Math.max(0.1, (w.thickness||0.2)*scale), color: '#c8cdd2' });
    if (obj) count++;
  });

  (data.zones || []).forEach(function(z) {
    if (!z.points || z.points.length < 3) return;
    var pts = z.points.map(function(p) { return { x: p.x * scale, z: p.z * scale }; });
    var obj = F.zone(pts, { color: z.color || '#e8720c', opacity: 0.13, label: z.label || 'Room' });
    if (obj) count++;
  });

  (data.info_points || []).forEach(function(ip) {
    var obj = F.infoPoint({ label: ip.label || 'Room', description: ip.description || '', color: '#e8720c' });
    if (obj && obj.mesh) { obj.mesh.position.set(ip.x * scale, 0, ip.z * scale); count++; }
  });

  W3D.SceneTree.rebuild();
  W3D.notify('Floorplan imported — ' + count + ' objects created', 'success');
}

function _edgeDetectionFallback(dataUrl, scale, keepExisting) {
  var img = new Image();
  img.onload = function() {
    var canvas   = document.createElement('canvas');
    var maxDim   = 500;
    var ratio    = Math.min(maxDim / img.width, maxDim / img.height);
    canvas.width  = Math.round(img.width  * ratio);
    canvas.height = Math.round(img.height * ratio);
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var pixels    = imageData.data;
    var W = canvas.width, H = canvas.height;

    if (!keepExisting) {
      W3D.objects.forEach(function(o) {
        if (o.mesh) { W3D.scene.remove(o.mesh); W3D.disposeMesh(o.mesh); }
      });
      W3D.objects = [];
    }

    var F         = W3D.Factory;
    var wallCount = 0;
    var threshold = 90;
    var minLen    = 10;

    function isDark(x, y) {
      var i = (y * W + x) * 4;
      return pixels[i] < threshold && pixels[i+1] < threshold && pixels[i+2] < threshold;
    }

    var x, y, segStart;

    // Horizontal passes
    for (y = 0; y < H; y += 4) {
      segStart = -1;
      for (x = 0; x <= W; x++) {
        var dark = x < W && isDark(x, y);
        if (dark && segStart === -1) {
          segStart = x;
        } else if (!dark && segStart !== -1) {
          if (x - segStart >= minLen) {
            F.wallFromPoints(
              {x: segStart * scale, z: y * scale},
              {x: x        * scale, z: y * scale},
              {height: 3, depth: 0.2, color: '#c8cdd2'}
            );
            wallCount++;
          }
          segStart = -1;
        }
      }
    }

    // Vertical passes
    for (x = 0; x < W; x += 4) {
      segStart = -1;
      for (y = 0; y <= H; y++) {
        var dark2 = y < H && isDark(x, y);
        if (dark2 && segStart === -1) {
          segStart = y;
        } else if (!dark2 && segStart !== -1) {
          if (y - segStart >= minLen) {
            F.wallFromPoints(
              {x: x * scale, z: segStart * scale},
              {x: x * scale, z: y        * scale},
              {height: 3, depth: 0.2, color: '#c8cdd2'}
            );
            wallCount++;
          }
          segStart = -1;
        }
      }
    }

    W3D.SceneTree.rebuild();
    W3D.notify(
      wallCount > 0
        ? 'Edge detection: ' + wallCount + ' walls extracted'
        : 'No clear walls found — try a cleaner image',
      wallCount > 0 ? 'success' : 'warn'
    );
  };
  img.src = dataUrl;
}
