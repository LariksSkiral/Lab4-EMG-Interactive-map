/* This file holds the global state (data) for our 3D app. It stores important things like the scene, camera, and objects. We need this to keep track of everything in the app, so different parts can share and update the data. Without it, the app wouldn't know what to draw or control. For beginners: Think of this as a shared notebook where all parts of the app write and read notes to work together. */
/* Minimal global state - This object holds all the important variables for our 3D app */
const W3D = {
  // The 3D scene where we place objects (like a stage)
  scene: null,
  // The camera that views the scene (like your eyes)
  camera: null,
  // The renderer that draws the scene on the screen
  renderer: null,
  // Controls for moving the camera with mouse (orbit around the scene)
  orbitControls: null,
  // A clock to track time (used for animations)
  clock: new THREE.Clock(),
  // Array to store all 3D objects in the scene
  objects: [],
  // Function to generate unique IDs for objects
  genId: function() { return 'obj_' + Math.random().toString(36).slice(2, 7); },

  cloneObjectTransform: function(objectEntry) {
    if (!objectEntry || !objectEntry.mesh) return null;

    return {
      position: {
        x: objectEntry.mesh.position.x,
        y: objectEntry.mesh.position.y,
        z: objectEntry.mesh.position.z,
      },
      rotation: {
        x: objectEntry.mesh.rotation.x,
        y: objectEntry.mesh.rotation.y,
        z: objectEntry.mesh.rotation.z,
      },
    };
  },

  applyObjectTransform: function(objectEntry, transformState) {
    if (!objectEntry || !objectEntry.mesh || !transformState) return;

    if (transformState.position) {
      objectEntry.mesh.position.set(
        transformState.position.x,
        transformState.position.y,
        transformState.position.z,
      );
    }

    if (transformState.rotation) {
      objectEntry.mesh.rotation.set(
        transformState.rotation.x,
        transformState.rotation.y,
        transformState.rotation.z,
      );
    }
  },

  restoreObject: function(objectToRestore, targetIndex) {
    if (!objectToRestore || !objectToRestore.mesh) return false;
    if (this.objects.includes(objectToRestore)) return true;

    this.scene.add(objectToRestore.mesh);

    if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= this.objects.length) {
      this.objects.splice(targetIndex, 0, objectToRestore);
    } else {
      this.objects.push(objectToRestore);
    }

    return true;
  },

  // Remove one tracked object from both the Three.js scene and our shared array.
  // Why this helper exists:
  // - Multiple features need safe deletion logic (toolbar delete, database refresh, etc.).
  // - Keeping it here means every part of the app removes objects the same way.
  removeObject: function(objectToRemove) {
    // Ignore empty calls so other code can call this defensively.
    if (!objectToRemove) return false;

    // Remove the 3D mesh/group from the scene graph first.
    if (objectToRemove.mesh && objectToRemove.mesh.parent) {
      objectToRemove.mesh.parent.remove(objectToRemove.mesh);
    }

    // Remove the tracked entry from the global objects array.
    this.objects = this.objects.filter(entry => entry !== objectToRemove);
    return true;
  },

  // Custom dialog utility — replaces native confirm() and alert() with styled modals.
  dialog: {
    _show({ title, message, confirmLabel, cancelLabel, isDanger }) {
      return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'w3d-dialog-backdrop';

        const icon = isDanger
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`
          : `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

        backdrop.innerHTML = `
          <div class="w3d-dialog" role="dialog" aria-modal="true">
            <div class="w3d-dialog-icon ${isDanger ? 'is-danger' : 'is-info'}">${icon}</div>
            <div class="w3d-dialog-body">
              <p class="w3d-dialog-title">${title}</p>
              ${message ? `<p class="w3d-dialog-message">${message}</p>` : ''}
            </div>
            <div class="w3d-dialog-actions">
              ${cancelLabel ? `<button class="w3d-dialog-btn secondary" data-action="cancel">${cancelLabel}</button>` : ''}
              <button class="w3d-dialog-btn ${isDanger ? 'danger' : 'primary'}" data-action="confirm">${confirmLabel}</button>
            </div>
          </div>`;

        const close = (result) => {
          backdrop.classList.remove('is-visible');
          setTimeout(() => backdrop.remove(), 180);
          resolve(result);
        };

        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) close(false);
        });
        backdrop.querySelectorAll('[data-action]').forEach(btn => {
          btn.addEventListener('click', () => close(btn.dataset.action === 'confirm'));
        });

        document.body.appendChild(backdrop);
        requestAnimationFrame(() => backdrop.classList.add('is-visible'));
      });
    },

    confirm(title, message) {
      return this._show({ title, message, confirmLabel: 'Ja, verwijderen', cancelLabel: 'Annuleren', isDanger: true });
    },

    alert(title, message) {
      return this._show({ title, message, confirmLabel: 'Sluiten', isDanger: false });
    },
  },

  History: {
    _limit: 60,
    _stack: [],
    _suspended: false,
    _pendingTransform: null,

    _isAdminPage() {
      const path = window.location.pathname.toLowerCase();
      return path.endsWith('admin.html') || path.endsWith('/admin.html');
    },

    _canTrack() {
      return !this._suspended && this._isAdminPage();
    },

    _push(entry) {
      if (!this._canTrack() || !entry) return;
      this._stack.push(entry);
      if (this._stack.length > this._limit) {
        this._stack.shift();
      }
    },

    _transformsEqual(left, right) {
      if (!left || !right) return false;

      const keys = [
        left.position.x === right.position.x,
        left.position.y === right.position.y,
        left.position.z === right.position.z,
        left.rotation.x === right.rotation.x,
        left.rotation.y === right.rotation.y,
        left.rotation.z === right.rotation.z,
      ];

      return keys.every(Boolean);
    },

    recordAddition(objectEntry) {
      if (!objectEntry || objectEntry.static) return;
      this._push({
        type: 'add',
        object: objectEntry,
        index: W3D.objects.indexOf(objectEntry),
      });
    },

    recordDeletion(objectEntry, indexBeforeDelete) {
      if (!objectEntry) return;
      this._push({
        type: 'delete',
        object: objectEntry,
        index: indexBeforeDelete,
        before: W3D.cloneObjectTransform(objectEntry),
      });
    },

    beginTransform(objectEntry) {
      if (!this._canTrack() || !objectEntry) return;
      this._pendingTransform = {
        object: objectEntry,
        before: W3D.cloneObjectTransform(objectEntry),
      };
    },

    commitTransform(objectEntry) {
      const pending = this._pendingTransform;
      this._pendingTransform = null;

      if (!this._canTrack() || !pending || pending.object !== objectEntry) return;

      const after = W3D.cloneObjectTransform(objectEntry);
      if (!after || this._transformsEqual(pending.before, after)) return;

      this._push({
        type: 'transform',
        object: objectEntry,
        before: pending.before,
        after,
      });
    },

    clearPendingTransform() {
      this._pendingTransform = null;
    },

    clear() {
      this._stack = [];
      this._pendingTransform = null;
    },

    undo() {
      if (!this._isAdminPage()) return false;

      const entry = this._stack.pop();
      if (!entry) {
        if (W3D.Database && typeof W3D.Database.setStatus === 'function') {
          W3D.Database.setStatus('Er is geen recente wijziging om ongedaan te maken.', true);
        }
        return false;
      }

      this._pendingTransform = null;
      this._suspended = true;

      try {
        if (entry.type === 'add') {
          if (W3D.Transform && W3D.Transform.selected === entry.object) {
            W3D.Transform.deselect();
          }
          W3D.removeObject(entry.object);
          if (W3D.Database && typeof W3D.Database.setStatus === 'function') {
            W3D.Database.setStatus('De laatste toevoeging is ongedaan gemaakt.');
          }
        } else if (entry.type === 'delete') {
          W3D.restoreObject(entry.object, entry.index);
          W3D.applyObjectTransform(entry.object, entry.before);
          if (W3D.Transform && typeof W3D.Transform.select === 'function') {
            W3D.Transform.select(entry.object);
          }
          if (W3D.Database && typeof W3D.Database.setStatus === 'function') {
            W3D.Database.setStatus('De laatst verwijderde machine is teruggezet.');
          }
        } else if (entry.type === 'transform') {
          W3D.applyObjectTransform(entry.object, entry.before);
          if (W3D.Transform && typeof W3D.Transform.select === 'function') {
            W3D.Transform.select(entry.object);
          }
          if (W3D.Database && typeof W3D.Database.setStatus === 'function') {
            W3D.Database.setStatus('De laatste verplaatsing of draaiing is ongedaan gemaakt.');
          }
        }
      } finally {
        this._suspended = false;
      }

      if (W3D.Database && typeof W3D.Database.markSceneDirty === 'function') {
        W3D.Database.markSceneDirty();
      }

      return true;
    },
  }
};