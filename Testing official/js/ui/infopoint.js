/* ═══════════════════════════════════════════════════════
   js/ui/infopoint.js
   Info-point hover tooltip and click popup.
   Handles both guest and admin viewing.
═══════════════════════════════════════════════════════ */

W3D.InfoPoint = {

  _hovered: null,

  init () {
    document.getElementById('popup-close')?.addEventListener('click', () => this.closePopup());
    document.getElementById('info-popup')?.addEventListener('click', e => {
      if (e.target === document.getElementById('info-popup')) this.closePopup();
    });
  },

  /* ── Called every mousemove from main.js ── */
  handleMouseMove (e) {
    const obj = W3D.getRaycastObject(e.clientX, e.clientY);
    const tip  = document.getElementById('tooltip');

    if (obj?.type === 'infopoint') {
      this._hovered = obj;
      tip.textContent = obj.props?.label || obj.name;
      tip.style.left  = (e.clientX + 16) + 'px';
      tip.style.top   = (e.clientY + 14) + 'px';
      tip.classList.remove('hidden');
      document.getElementById('three-canvas').style.cursor = 'pointer';
    } else {
      this._hovered = null;
      tip.classList.add('hidden');
      // Only reset cursor if not in drawing mode
      if (!W3D.draw.active) {
        document.getElementById('three-canvas').style.cursor = '';
      }
    }
  },

  /* ── Called on viewport click from main.js ── */
  handleClick (e) {
    const obj = W3D.getRaycastObject(e.clientX, e.clientY);
    if (obj?.type === 'infopoint') {
      this.openPopup(obj);
      return true;   // consumed
    }
    return false;
  },

  openPopup (obj) {
    const props = obj.props || {};
    const files = obj.files || [];

    let html = '';

    // Type tag
    html += `<div class="popup-type-tag">📌 Info Point</div>`;

    // Title
    html += `<h2>${this._esc(props.label || obj.name)}</h2>`;

    // Description
    if (props.description && props.description.trim()) {
      html += `<div class="popup-description">${this._esc(props.description)}</div>`;
    } else {
      html += `<div class="popup-no-desc">No description provided.</div>`;
    }

    // Files
    if (files.length > 0) {
      html += `<div class="popup-files-title">📎 Attachments (${files.length})</div>`;
      html += `<div class="popup-files">`;
      files.forEach((f, i) => {
        const icon = this._fileIcon(f.type);
        html += `<button class="popup-file-btn" data-idx="${i}">${icon} ${this._esc(f.name)}</button>`;
      });
      html += `</div>`;
    }

    document.getElementById('popup-body').innerHTML = html;

    // File download handlers
    document.querySelectorAll('.popup-file-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = files[parseInt(btn.dataset.idx)];
        if (!f?.data) return;
        const a = Object.assign(document.createElement('a'), { href: f.data, download: f.name });
        a.click();
      });
    });

    document.getElementById('info-popup').classList.remove('hidden');
  },

  closePopup () {
    document.getElementById('info-popup').classList.add('hidden');
  },

  _fileIcon (mimeType = '') {
    if (mimeType.startsWith('image/'))       return '🖼';
    if (mimeType === 'application/pdf')      return '📄';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('word') || mimeType.includes('document'))     return '📝';
    if (mimeType.startsWith('video/'))       return '🎬';
    if (mimeType.startsWith('audio/'))       return '🎵';
    return '📎';
  },

  _esc (s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  },
};
