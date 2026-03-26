/* ═══════════════════════════════════════════════════════
   js/core/state.js
   Single source of truth for all application state.
   All other modules read from and write to W3D.State.
═══════════════════════════════════════════════════════ */

const W3D = {

  /* ── Auth ───────────────────────────────────── */
  isAdmin: false,

  /* ── Three.js core ──────────────────────────── */
  scene:            null,
  camera:           null,
  renderer:         null,
  orbitControls:    null,
  transformControls:null,
  clock:            new THREE.Clock(),
  raycaster:        new THREE.Raycaster(),
  mouse:            new THREE.Vector2(),

  /* ── Scene helpers ──────────────────────────── */
  groundPlane:  null,   // invisible ground mesh for raycasting
  gridHelper:   null,

  /* ── Objects registry ───────────────────────── */
  // Each entry: { id, type, name, color, mesh, props:{}, files:[] }
  objects: [],
  idCounter: 0,

  /* ── Selection ──────────────────────────────── */
  selectedObject: null,

  /* ── Active tool ────────────────────────────── */
  // 'select' | 'rotate' | 'scale'
  activeTool: 'select',

  /* ── Snap ───────────────────────────────────── */
  snapEnabled: false,
  snapSize: 0.5,

  /* ── View ───────────────────────────────────── */
  viewMode: 'perspective',  // 'perspective' | 'top'

  /* ── Scene metadata ─────────────────────────── */
  sceneName: 'Untitled Scene',

  /* ── History (undo/redo) ────────────────────── */
  undoStack: [],
  redoStack: [],

  /* ── Drawing state ──────────────────────────── */
  draw: {
    active:   false,          // are we in any drawing mode?
    mode:     null,           // 'wall' | 'zone' | 'floorline'
    points:   [],             // accumulated world points
    previewMesh: null,        // temporary preview mesh in scene
    startPoint: null,         // used by wall tool
  },
};

/* ── Helpers ─────────────────────────────────────── */

W3D.genId = function () {
  return 'obj_' + (++W3D.idCounter) + '_' + Math.random().toString(36).slice(2, 7);
};

W3D.notify = function (msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'notif' + (type === 'error' ? ' error' : type === 'warn' ? ' warn' : type === 'success' ? ' success' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3100);
};
