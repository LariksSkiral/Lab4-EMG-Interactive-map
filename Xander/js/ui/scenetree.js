/* ═══════════════════════════════════════════════════════
   js/ui/scenetree.js
   Left-sidebar scene tree: lists all objects, handles
   click-to-select and visibility toggle.
═══════════════════════════════════════════════════════ */

W3D.SceneTree = {

  ICONS: {
    wall: '🧱', floor: '⬛', ceiling: '🔲', door: '🚪', window: '🪟',
    staircase: '🪜', column: '🏛', box: '📦', cylinder: '🔵', sphere: '⚫',
    cone: '🔺', plane: '▭', floorline: '➖', zone: '🔷', arrow: '➡',
    infopoint: '📌', label3d: '🔤', 'image-plane': '🖼', glb: '🧊',
    'point-light': '💡', 'spot-light': '🔦',
  },

  rebuild () {
    const tree   = document.getElementById('scene-tree');
    const query  = (document.getElementById('scene-search')?.value ?? '').toLowerCase();

    if (!tree) return;
    tree.innerHTML = '';

    const filtered = W3D.objects.filter(o =>
      !query || o.name.toLowerCase().includes(query)
    );

    if (!filtered.length) {
      tree.innerHTML = '<div class="tree-empty">' + (query ? 'No matches' : 'Scene is empty') + '</div>';
      return;
    }

    filtered.forEach(obj => {
      const isVisible  = obj.mesh?.visible !== false;
      const isSelected = obj === W3D.selectedObject;

      const item = document.createElement('div');
      item.className = 'tree-item' + (isSelected ? ' selected' : '') + (!isVisible ? ' hidden-obj' : '');
      item.dataset.id = obj.id;

      item.innerHTML = `
        <span class="tree-type-icon">${this.ICONS[obj.type] ?? '◻'}</span>
        <span class="tree-name">${this._esc(obj.name)}</span>
        ${W3D.isAdmin ? `<button class="tree-vis-btn" title="Toggle visibility">${isVisible ? '👁' : '🙈'}</button>` : ''}
      `;

      item.addEventListener('click', e => {
        if (e.target.classList.contains('tree-vis-btn')) return;
        W3D.Select.pick(obj);
      });

      item.querySelector('.tree-vis-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        if (obj.mesh) obj.mesh.visible = !obj.mesh.visible;
        this.rebuild();
      });

      tree.appendChild(item);
    });
  },

  init () {
    document.getElementById('scene-search')?.addEventListener('input', () => this.rebuild());
  },

  _esc (s) { return String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;'); },
};
