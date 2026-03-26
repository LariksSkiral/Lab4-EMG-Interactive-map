/* ═══════════════════════════════════════════════════════
   js/ui/modal.js
   Lightweight modal dialog utility.
   W3D.Modal.show / confirm / prompt
═══════════════════════════════════════════════════════ */

W3D.Modal = {

  show (title, bodyHTML, buttons = []) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML    = bodyHTML;
    const btns = document.getElementById('modal-btns');
    btns.innerHTML = '';
    buttons.forEach(b => {
      const el = document.createElement('button');
      el.className  = 'modal-btn' + (b.cls ? ' ' + b.cls : '');
      el.textContent = b.label;
      el.addEventListener('click', () => { this.close(); b.action?.(); });
      btns.appendChild(el);
    });
    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  close () {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  confirm (title, message, onConfirm) {
    this.show(title, `<p>${message}</p>`, [
      { label: 'Cancel' },
      { label: 'Confirm', cls: 'danger', action: onConfirm },
    ]);
  },

  prompt (title, message, defaultValue, onSubmit) {
    this.show(
      title,
      `<p>${message}</p><input id="modal-prompt-input" value="${defaultValue ?? ''}" style="margin-top:8px"/>`,
      [
        { label: 'Cancel' },
        { label: 'OK', cls: 'primary', action: () => {
          onSubmit(document.getElementById('modal-prompt-input')?.value ?? '');
        }},
      ]
    );
    // Focus after render
    setTimeout(() => document.getElementById('modal-prompt-input')?.focus(), 50);
  },

  init () {
    document.getElementById('modal-overlay')?.addEventListener('click', e => {
      if (e.target === document.getElementById('modal-overlay')) this.close();
    });
  },
};
