/* This file starts the app when the page loads. It calls the setup functions and loads the 3D model. We need this to kick off everything. Without it, the app wouldn't run. For beginners: This is like the 'start' button that gets everything going when you open the page. */
// Import-like top-level destructure from Supabase helper in this classic script setup.
const { onAuthStateChange } = W3D.Supabase || {};

/* Application entry point - This starts the app when the page loads */
W3D.init = async function () {
  const friendlyClientMessage = (error, fallbackMessage) => {
    const rawMessage = String((error && error.message) || '').toLowerCase();

    if (!rawMessage) return fallbackMessage;
    if (rawMessage.includes('verbinding') || rawMessage.includes('network') || rawMessage.includes('fetch')) {
      return 'Er kon geen verbinding worden gemaakt. Probeer het opnieuw.';
    }
    if (rawMessage.includes('supabase') || rawMessage.includes('opslag')) {
      return 'Deze functie is op dit moment niet beschikbaar.';
    }

    return error.message || fallbackMessage;
  };

  // Set default grid visibility by mode:
  // - Admin page gets grid on by default
  // - Viewer page has grid off by default
  const path = window.location.pathname.toLowerCase();
  const isAdmin = path.endsWith("admin.html") || path.endsWith("/admin.html");
  W3D.gridVisible = isAdmin;

  // Step 1: Non-visual UI setup — runs immediately, no renderer needed.
  if (W3D.Database) W3D.Database.setupUI();

  // Step 2: Wire view-toggle buttons in the topbar.
  const btn3d = document.getElementById("btn-view-3d");
  const btnTop = document.getElementById("btn-view-top");
  if (btn3d)
    btn3d.addEventListener("click", () => W3D.setViewMode && W3D.setViewMode("3d"));
  if (btnTop)
    btnTop.addEventListener("click", () => W3D.setViewMode && W3D.setViewMode("top"));

  // Step 3: Viewer help modal — no renderer needed.
  const viewerHelpTrigger = document.getElementById('viewer-help-trigger');
  const viewerHelpModal = document.getElementById('viewer-help-modal');
  const viewerHelpClose = document.getElementById('viewer-help-close');
  const viewerHelpBackdrop = document.getElementById('viewer-help-backdrop');

  if (viewerHelpTrigger && viewerHelpModal) {
    const openViewerHelp = () => {
      viewerHelpModal.classList.remove('is-hidden');
      viewerHelpModal.setAttribute('aria-hidden', 'false');
      viewerHelpTrigger.setAttribute('aria-expanded', 'true');
      if (viewerHelpClose) viewerHelpClose.focus();
    };

    const closeViewerHelp = () => {
      viewerHelpModal.classList.add('is-hidden');
      viewerHelpModal.setAttribute('aria-hidden', 'true');
      viewerHelpTrigger.setAttribute('aria-expanded', 'false');
      viewerHelpTrigger.focus();
    };

    viewerHelpTrigger.addEventListener('click', () => {
      const isOpen = !viewerHelpModal.classList.contains('is-hidden');
      if (isOpen) {
        closeViewerHelp();
        return;
      }
      openViewerHelp();
    });

    if (viewerHelpClose) {
      viewerHelpClose.addEventListener('click', closeViewerHelp);
    }

    if (viewerHelpBackdrop) {
      viewerHelpBackdrop.addEventListener('click', closeViewerHelp);
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !viewerHelpModal.classList.contains('is-hidden')) {
        closeViewerHelp();
      }
    });
  }

  // ── Scene initializer ────────────────────────────────────────────────────
  // This function sets up the 3D world: renderer, controls, machine interactions,
  // and loads the local models with preloader tracking.
  //
  // WHY is this a separate function?
  // For the admin page we must check authentication FIRST. Only after confirming
  // the user is logged in do we initialise the renderer and load models.
  // For the viewer page we call this immediately.
  //
  // The _sceneReady flag ensures this runs at most once per page load,
  // even if showAdminPanel() is called multiple times.
  let _sceneReady = false;

  const initScene = async () => {
    if (_sceneReady) return;
    _sceneReady = true;

    // Reset and show the preloader, then set total to 3 local models.
    // The lock prevents the preloader from closing until database models are also done.
    if (W3D.Preloader) {
      W3D.Preloader.reset();
      W3D.Preloader.setTotal(2);
      W3D.Preloader.lock();
      W3D.Preloader.setStatus('Werkplaats laden...');
    }

    // Build the 3D world (camera, lights, grid, renderer).
    W3D.initRenderer();

    // Initialise transform tools (select, move, rotate) if available.
    if (W3D.Transform) W3D.Transform.init();

    // Machine selection & action UI — needs the renderer canvas.
    const machineActionUI = document.getElementById('machine-action-icons');
    if (machineActionUI) {
      const canvas = W3D.renderer && W3D.renderer.domElement;
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const actionButtons = Array.from(machineActionUI.querySelectorAll('.action-icon'));
      let selectedMachine = null;
      let highlightedMaterials = [];
      let pointerDown = null;

      const clearHighlight = () => {
        highlightedMaterials.forEach(material => {
          if (material._origEmissive) {
            material.emissive.copy(material._origEmissive);
            delete material._origEmissive;
          }
          material.emissiveIntensity = 0;
        });
        highlightedMaterials = [];
      };

      const applyHighlight = mesh => {
        clearHighlight();
        mesh.traverse(child => {
          if (!child.isMesh || !child.material) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(material => {
            if (!material.emissive) return;
            if (!material._origEmissive) material._origEmissive = material.emissive.clone();
            material.emissive.set(0xe8720c);
            material.emissiveIntensity = 0.32;
            highlightedMaterials.push(material);
          });
        });
      };

      const getSelectedMachineLink = action => {
        const fallback = 'https://www.google.com';
        if (!selectedMachine || !selectedMachine.props) return fallback;

        const links = {
          course: selectedMachine.props.link1 || selectedMachine.props.courseLink || fallback,
          maintenance: selectedMachine.props.link2 || selectedMachine.props.maintenanceLink || fallback,
          safety: selectedMachine.props.link3 || selectedMachine.props.safetyLink || fallback,
        };

        return links[action] || fallback;
      };

      const updateActionButtons = () => {
        actionButtons.forEach(button => {
          const action = button.getAttribute('data-action');
          button.disabled = !getSelectedMachineLink(action);
        });
      };

      const updateActionIcons = () => {
        if (!selectedMachine || !selectedMachine.mesh) {
          machineActionUI.classList.add('is-hidden');
          return;
        }

        const bbox = new THREE.Box3().setFromObject(selectedMachine.mesh);
        if (bbox.isEmpty()) {
          machineActionUI.classList.add('is-hidden');
          return;
        }

        const worldPos = new THREE.Vector3(
          (bbox.min.x + bbox.max.x) / 2,
          bbox.max.y,
          (bbox.min.z + bbox.max.z) / 2
        );

        worldPos.project(W3D.activeCamera || W3D.camera);
        if (worldPos.z < -1 || worldPos.z > 1) {
          machineActionUI.classList.add('is-hidden');
          return;
        }

        const x = ((worldPos.x + 1) / 2) * window.innerWidth;
        const y = ((-worldPos.y + 1) / 2) * window.innerHeight;
        machineActionUI.style.left = `${x}px`;
        machineActionUI.style.top = `${y - 8}px`;
        machineActionUI.classList.remove('is-hidden');
        updateActionButtons();
      };

      const deselectMachine = () => {
        selectedMachine = null;
        clearHighlight();
        machineActionUI.classList.add('is-hidden');
        updateActionButtons();
      };

      const selectMachine = objectEntry => {
        selectedMachine = objectEntry;
        applyHighlight(objectEntry.mesh);

        const nameEl = machineActionUI.querySelector('.machine-card-name');
        if (nameEl) nameEl.textContent = objectEntry.name || 'Machine';

        updateActionIcons();
        if (W3D.focusCameraOnObject) {
          W3D.focusCameraOnObject(objectEntry);
        }
      };

      const pickMachine = event => {
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        W3D.scene.updateMatrixWorld(true);
        raycaster.setFromCamera(pointer, W3D.activeCamera || W3D.camera);

        const rootMeshes = W3D.objects.filter(objectEntry => !objectEntry.static).map(objectEntry => objectEntry.mesh);
        const hits = raycaster.intersectObjects(rootMeshes, true);
        if (hits.length === 0) return null;

        let node = hits[0].object;
        while (node) {
          const foundObject = W3D.objects.find(objectEntry => objectEntry.mesh === node && !objectEntry.static);
          if (foundObject) return foundObject;
          node = node.parent;
        }

        return null;
      };

      machineActionUI.addEventListener('click', event => {
        const button = event.target.closest('.action-icon');
        if (!button || button.disabled) return;

        const action = button.getAttribute('data-action');
        const url = getSelectedMachineLink(action);
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });

      if (canvas) {
        canvas.addEventListener('pointerdown', event => {
          pointerDown = { x: event.clientX, y: event.clientY };
        });

        canvas.addEventListener('click', event => {
          if (pointerDown) {
            const deltaX = event.clientX - pointerDown.x;
            const deltaY = event.clientY - pointerDown.y;
            const moved = Math.hypot(deltaX, deltaY) > 6;
            pointerDown = null;
            if (moved) return;
          }

          const pickedMachine = pickMachine(event);
          if (pickedMachine) {
            selectMachine(pickedMachine);
            return;
          }

          deselectMachine();
        });
      }

      if (W3D.orbitControls) {
        W3D.orbitControls.addEventListener('change', updateActionIcons);
      }

      window.addEventListener('resize', updateActionIcons);
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          deselectMachine();
        }
      });
    }

    // Load local 3D models only when the files are reachable on this deployment.
    const isElectron = typeof window.electronAPI !== 'undefined';
    const isDevMode = isElectron ? window.electronAPI.isDev : true;

    console.log('Model Loading Config:', { isElectron, isDevMode });

    const defaultModelPaths = ["models/plattegrond.glb", "models/walls.glb"];
    for (const modelPath of defaultModelPaths) {
      try {
        let finalPath = modelPath;
        if (isElectron && !isDevMode && window.electronAPI.resourcesPath) {
          finalPath = `file://${window.electronAPI.resourcesPath}/${modelPath}`;
          console.log(`Production Electron: Using file:// path: ${finalPath}`);
        } else {
          console.log(`Dev/Web mode: Using relative path: ${finalPath}`);
        }

        if (isElectron && !isDevMode) {
          // Electron productie: laad direct via file:// URL.
          W3D.Factory.loadLocalGLTF(finalPath)
            .then(() => W3D.Preloader && W3D.Preloader.increment())
            .catch(() => W3D.Preloader && W3D.Preloader.increment());
        } else {
          // Web/dev: controleer eerst of het bestand bereikbaar is via een HEAD-verzoek.
          const modelCheck = await fetch(modelPath, { method: "HEAD" });
          if (modelCheck.ok || modelCheck.status === 405) {
            W3D.Factory.loadLocalGLTF(modelPath)
              .then(() => W3D.Preloader && W3D.Preloader.increment())
              .catch(() => W3D.Preloader && W3D.Preloader.increment());
          } else {
            // Bestand niet beschikbaar → toch increment zodat de teller klopt.
            if (W3D.Preloader) W3D.Preloader.increment();
          }
        }
      } catch (modelErr) {
        // Model laden mislukt → increment zodat de preloader niet blijft hangen.
        if (W3D.Preloader) W3D.Preloader.increment();
        console.warn(
          `Default local model ${modelPath} is not available on this deployment.`,
          modelErr,
        );
      }
    }
  };
  // ── End initScene ────────────────────────────────────────────────────────

  // Step 4: Find key UI elements for auth-driven admin view behavior.
  const loginPanel = document.getElementById("login-panel");
  const adminPanel = document.getElementById("admin-panel");
  const hasAdminAuthPanels = Boolean(loginPanel && adminPanel);
  const hasStorageControls = Boolean(
    document.getElementById("sb-file-list") ||
      document.getElementById("sb-load-btn") ||
      document.getElementById("sb-refresh-btn"),
  );
  const hasDatabaseFeatures = Boolean(W3D.Database);

  // Step 5: Set up model-library controls before init so status errors can be shown.
  if (W3D.Supabase && hasStorageControls) {
    W3D.Supabase.setupUI();
  }

  // Step 6: Connect Supabase if this page needs auth, storage, or database reads/writes.
  if (
    W3D.Supabase &&
    (hasAdminAuthPanels || hasStorageControls || hasDatabaseFeatures)
  ) {
    await W3D.Supabase.initializeFromConfig();
  }

  // Step 7: Admin authentication workflow and panel switching.
  if (hasAdminAuthPanels && W3D.Auth && W3D.Supabase) {
    const emailInput = document.getElementById("auth-email");
    const passwordInput = document.getElementById("auth-password");
    const loginButton = document.getElementById("btn-auth-login");
    const registerButton = document.getElementById("btn-auth-register");
    const logoutButton = document.getElementById("btn-auth-logout");
    const authError = document.getElementById("auth-error");

    // showLoginPanel: show the login form immediately, no 3D scene or preloader.
    const showLoginPanel = () => {
      loginPanel.classList.remove("is-hidden");
      adminPanel.classList.add("is-hidden");
      if (W3D.Database) {
        W3D.Database.setControlsDisabled(true);
      }
    };

    // showAdminPanel: initialise the 3D scene (only first time), then load machines.
    // The preloader is managed inside initScene() and unlocked after machine loading.
    const showAdminPanel = async () => {
      // initScene() is guarded by _sceneReady — runs at most once.
      await initScene();

      loginPanel.classList.add("is-hidden");
      adminPanel.classList.remove("is-hidden");
      if (W3D.Supabase && hasStorageControls) {
        W3D.Supabase.setControlsDisabled(false);
        W3D.Supabase.listFilesAndPopulateDropdown();
      }
      if (W3D.Database) {
        W3D.Database.setControlsDisabled(false);
        await W3D.Database.loadSavedMachinesIntoScene();
      }
      // All machines loaded → remove the lock so the preloader can close.
      if (W3D.Preloader) W3D.Preloader.unlock();
    };

    if (loginButton) {
      loginButton.addEventListener("click", async () => {
        const email = emailInput ? emailInput.value.trim() : "";
        const password = passwordInput ? passwordInput.value : "";
        const { error: loginError } = await W3D.Auth.login(email, password);
        if (loginError && authError) {
          authError.textContent = loginError.message || 'Inloggen is niet gelukt. Probeer het opnieuw.';
        }
      });
    }

    if (registerButton) {
      registerButton.addEventListener("click", async () => {
        const email = emailInput ? emailInput.value.trim() : "";
        const password = passwordInput ? passwordInput.value : "";
        const { error: registerError } = await W3D.Auth.register(
          email,
          password,
        );
        if (registerError && authError) {
          authError.textContent = registerError.message || 'Het aanmaken van het account is niet gelukt.';
          return;
        }
        if (authError) {
          authError.textContent =
            'Account aangemaakt. Controleer eerst je e-mail als bevestiging nodig is voordat je inlogt.';
        }
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        const { error: logoutError } = await W3D.Auth.logout();
        if (logoutError && authError) {
          authError.textContent = logoutError.message || 'Uitloggen is niet gelukt. Probeer het opnieuw.';
        }
      });
    }

    // Grid toggle in admin mode
    const gridToggleBtn = document.getElementById("btn-grid-toggle");
    const updateGridToggleState = () => {
      if (!gridToggleBtn) return;
      const visible = Boolean(W3D.gridVisible);
      gridToggleBtn.classList.toggle("active", visible);
      gridToggleBtn.setAttribute("aria-pressed", visible ? "true" : "false");
    };

    if (gridToggleBtn) {
      gridToggleBtn.addEventListener("click", () => {
        const newState = !Boolean(W3D.gridVisible);
        if (typeof W3D.setGridVisible === "function") {
          W3D.setGridVisible(newState);
        } else if (W3D.gridHelper) {
          W3D.gridHelper.visible = newState;
          W3D.gridVisible = newState;
        }
        updateGridToggleState();
      });
    }

    updateGridToggleState();

    // ── Drawer + create overlay flow ───────────────────────────────────────
    const uploaderDrawer = document.getElementById("uploader-drawer");
    const openDrawerBtn = document.getElementById("btn-open-uploader");
    const closeDrawerBtn = document.getElementById("drawer-close");
    const openMachineFormBtn = document.getElementById("btn-open-machine-form");
    const machineOverlay = document.getElementById("machine-overlay");
    const closeOverlayBtn = document.getElementById("overlay-close");

    const openDrawer = () => {
      if (uploaderDrawer) uploaderDrawer.classList.add("is-open");
      if (openDrawerBtn) openDrawerBtn.classList.add("drawer-open");
    };

    const closeDrawer = () => {
      if (uploaderDrawer) uploaderDrawer.classList.remove("is-open");
      if (uploaderDrawer) uploaderDrawer.classList.remove("is-expanded");
      if (machineOverlay) machineOverlay.classList.remove("is-open");
      if (openDrawerBtn) openDrawerBtn.classList.remove("drawer-open");
    };

    const openOverlay = () => {
      if (uploaderDrawer) uploaderDrawer.classList.add("is-expanded");
      if (machineOverlay) machineOverlay.classList.add("is-open");
    };

    const resetOverlayToCreateMode = () => {
      _editingMachineTypeId = null;
      _editingStoragePath = null;

      const overlayTitle = machineOverlay && machineOverlay.querySelector(".overlay-title");
      if (overlayTitle) overlayTitle.textContent = "Nieuwe machine toevoegen";
      if (saveMachineBtn) saveMachineBtn.textContent = "Machine opslaan";

      if (machineNameInput) machineNameInput.value = "";
      if (link1Input) link1Input.value = "";
      if (link2Input) link2Input.value = "";
      if (link3Input) link3Input.value = "";
      clearModelFile();

      if (machineStatus) {
        machineStatus.textContent = "";
        machineStatus.classList.remove("is-ok", "is-error");
      }

      const editCurrentFile = document.getElementById("edit-current-model");
      if (editCurrentFile) editCurrentFile.remove();
      if (modelDropZone) modelDropZone.style.display = "";
    };

    const closeOverlay = () => {
      if (machineOverlay) machineOverlay.classList.remove("is-open");
      if (uploaderDrawer) uploaderDrawer.classList.remove("is-expanded");
      resetOverlayToCreateMode();
    };

    if (openDrawerBtn) {
      openDrawerBtn.addEventListener("click", () => {
        uploaderDrawer && uploaderDrawer.classList.contains("is-open")
          ? closeDrawer()
          : openDrawer();
      });
    }

    if (closeDrawerBtn) {
      closeDrawerBtn.addEventListener("click", closeDrawer);
    }

    if (openMachineFormBtn) {
      openMachineFormBtn.addEventListener("click", () => {
        openDrawer();
        openOverlay();
      });
    }

    if (closeOverlayBtn) {
      closeOverlayBtn.addEventListener("click", () => {
        closeOverlay();
      });
    }

    // ── Machine overlay file handling ──────────────────────────────────────
    const modelFileInput = document.getElementById("model-file-input");
    const modelDropZone = document.getElementById("model-drop-zone");
    const modelPreview = document.getElementById("model-preview");
    const modelPreviewName = document.getElementById("model-preview-name");
    const modelPreviewSize = document.getElementById("model-preview-size");
    const modelPreviewClear = document.getElementById("model-preview-clear");
    const saveMachineBtn = document.getElementById("save-machine-btn");
    const machineStatus = document.getElementById("machine-status");
    const machineNameInput = document.getElementById("machine-name");
    const link1Input = document.getElementById("link1");
    const link2Input = document.getElementById("link2");
    const link3Input = document.getElementById("link3");

    let selectedModelFile = null;
    let _editingMachineTypeId = null;
    let _editingStoragePath = null;

    const formatFileSize = (bytes) => {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    const handleModelFileSelected = (file) => {
      selectedModelFile = file;
      if (file) {
        if (modelPreviewName) modelPreviewName.textContent = file.name;
        if (modelPreviewSize)
          modelPreviewSize.textContent = formatFileSize(file.size);
        if (modelPreview) modelPreview.classList.remove("is-hidden");
        if (modelDropZone) modelDropZone.classList.add("has-file");
        updateSaveButton();
      } else {
        clearModelFile();
      }
    };

    const clearModelFile = () => {
      selectedModelFile = null;
      if (modelFileInput) modelFileInput.value = "";
      if (modelPreview) modelPreview.classList.add("is-hidden");
      if (modelDropZone) modelDropZone.classList.remove("has-file");
      updateSaveButton();
    };

    const updateSaveButton = () => {
      const machineName = machineNameInput ? machineNameInput.value.trim() : "";
      const hasName = machineName.length > 0;
      const hasModel = selectedModelFile !== null;
      const isEditing = _editingMachineTypeId !== null;
      if (saveMachineBtn) saveMachineBtn.disabled = !(hasName && (hasModel || isEditing));
    };

    if (modelFileInput) {
      modelFileInput.addEventListener("change", () => {
        const file = modelFileInput.files && modelFileInput.files[0];
        handleModelFileSelected(file);
      });
    }

    if (modelDropZone) {
      modelDropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        modelDropZone.classList.add("is-drag-over");
      });
      modelDropZone.addEventListener("dragleave", () => {
        modelDropZone.classList.remove("is-drag-over");
      });
      modelDropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        modelDropZone.classList.remove("is-drag-over");
        const file = e.dataTransfer && e.dataTransfer.files[0];
        if (file && modelFileInput) {
          try {
            const dt = new DataTransfer();
            dt.items.add(file);
            modelFileInput.files = dt.files;
          } catch (dtErr) {
            // Fallback for browsers without DataTransfer support
            selectedModelFile = file;
          }
          handleModelFileSelected(file);
        }
      });
    }

    if (modelPreviewClear) {
      modelPreviewClear.addEventListener("click", (e) => {
        e.preventDefault();
        clearModelFile();
      });
    }

    // Update save button when name changes
    if (machineNameInput) {
      machineNameInput.addEventListener("input", updateSaveButton);
    }

    // Save machine logic (create or edit)
    if (saveMachineBtn) {
      saveMachineBtn.addEventListener("click", async () => {
        const machineName = machineNameInput ? machineNameInput.value.trim() : "";
        const link1 = link1Input ? link1Input.value.trim() : "";
        const link2 = link2Input ? link2Input.value.trim() : "";
        const link3 = link3Input ? link3Input.value.trim() : "";
        const isEditing = _editingMachineTypeId !== null;

        if (!machineName || !W3D.Supabase || !W3D.Database) return;
        if (!isEditing && !selectedModelFile) return;

        saveMachineBtn.disabled = true;
        if (machineStatus) {
          machineStatus.textContent = isEditing ? 'Wijzigingen worden opgeslagen...' : 'Machine wordt opgeslagen...';
          machineStatus.classList.remove("is-ok", "is-error");
        }

        try {
          if (!W3D.Supabase.client) {
            throw new Error(W3D.Supabase.lastInitError || 'De opslag is op dit moment niet beschikbaar.');
          }

          if (isEditing) {
            console.log('[main] Bewerken opslaan — meegegeven waarden:', {
              id: _editingMachineTypeId,
              name: machineName,
              oldStoragePath: _editingStoragePath,
              newFile: selectedModelFile ? selectedModelFile.name : null,
              links: [link1, link2, link3],
            });
            await W3D.Database.updateMachineTypeWithLinks({
              id: _editingMachineTypeId,
              name: machineName,
              oldStoragePath: _editingStoragePath,
              newFile: selectedModelFile,
              links: [link1, link2, link3],
            });
          } else {
            await W3D.Database.createMachineTypeWithFile({
              name: machineName,
              file: selectedModelFile,
              links: [link1, link2, link3],
            });
          }

          if (W3D.Supabase.listFilesAndPopulateDropdown) {
            await W3D.Supabase.listFilesAndPopulateDropdown();
          }

          if (machineStatus) {
            machineStatus.textContent = isEditing
              ? `Machine "${machineName}" is bijgewerkt.`
              : `Machine "${machineName}" is opgeslagen.`;
            machineStatus.classList.remove("is-error");
            machineStatus.classList.add("is-ok");
          }

          setTimeout(() => {
            closeOverlay();
            openDrawer();
          }, 2000);
        } catch (error) {
          console.error("Error saving machine:", error);
          if (machineStatus) {
            machineStatus.textContent = friendlyClientMessage(error, isEditing
              ? 'Het bijwerken van de machine is niet gelukt.'
              : 'Het opslaan van de machine is niet gelukt.');
            machineStatus.classList.remove("is-ok");
            machineStatus.classList.add("is-error");
          }
        } finally {
          saveMachineBtn.disabled = false;
        }
      });
    }

    // ── Edit overlay helpers ───────────────────────────────────────────────
    const openOverlayForEdit = (machineTypeData) => {
      _editingMachineTypeId = machineTypeData.id || null;
      _editingStoragePath = machineTypeData.storagePath || null;

      const overlayTitle = machineOverlay && machineOverlay.querySelector(".overlay-title");
      if (overlayTitle) overlayTitle.textContent = "Machine bewerken";
      if (saveMachineBtn) saveMachineBtn.textContent = "Wijzigingen opslaan";

      if (machineNameInput) machineNameInput.value = machineTypeData.name || "";
      if (link1Input) link1Input.value = machineTypeData.link1 || "";
      if (link2Input) link2Input.value = machineTypeData.link2 || "";
      if (link3Input) link3Input.value = machineTypeData.link3 || "";

      // Show current model filename above the drop zone; hide the drop zone label.
      let editCurrentFile = document.getElementById("edit-current-model");
      if (!editCurrentFile && modelDropZone) {
        editCurrentFile = document.createElement("div");
        editCurrentFile.id = "edit-current-model";
        editCurrentFile.className = "model-preview";
        modelDropZone.parentNode.insertBefore(editCurrentFile, modelDropZone);
      }
      if (editCurrentFile) {
        const fileName = _editingStoragePath
          ? _editingStoragePath.split("/").pop()
          : "—";
        editCurrentFile.innerHTML =
          `<span class="model-preview-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></span>` +
          `<div class="model-preview-info"><span class="model-preview-name">Huidig model: ${fileName}</span>` +
          `<span class="model-preview-size">Nieuw bestand hieronder kiezen om te vervangen</span></div>`;
        editCurrentFile.style.display = "flex";
      }

      clearModelFile();
      if (machineStatus) {
        machineStatus.textContent = "";
        machineStatus.classList.remove("is-ok", "is-error");
      }

      updateSaveButton();
      openDrawer();
      openOverlay();
    };

    // Expose globally so transform.js and supabase.js can call it.
    W3D.openOverlayForEdit = openOverlayForEdit;

    // Called by the taskbar edit button via W3D.Transform.
    // Uses data already stored in sel.props (set when the machine was loaded from the DB).
    // Falls back to a Supabase fetch when machineTypeId is known but some props are missing.
    W3D.onEditSelectedMachine = async () => {
      const sel = W3D.Transform && W3D.Transform.selected;
      if (!sel) return;

      const props = sel.props || {};
      const machineTypeId = props.machineTypeId || null;

      // Always open with whatever we have from props first.
      const editData = {
        id: machineTypeId,
        name: sel.name || "",
        storagePath: props.storagePath || "",
        link1: props.link1 || props.courseLink || "",
        link2: props.link2 || props.maintenanceLink || "",
        link3: props.link3 || props.safetyLink || "",
      };

      // If we have a machineTypeId and a Supabase client, try to fetch fresher data.
      if (machineTypeId && W3D.Supabase && W3D.Supabase.client) {
        try {
          const { data } = await W3D.Supabase.client
            .from("machine_types")
            .select("id, name, model, machine_type_links(*)")
            .eq("id", machineTypeId)
            .maybeSingle();

          if (data) {
            const linkRow = Array.isArray(data.machine_type_links)
              ? data.machine_type_links[0]
              : data.machine_type_links || null;

            editData.id = data.id;
            editData.name = data.name || editData.name;
            editData.storagePath = data.model || editData.storagePath;
            editData.link1 = linkRow ? (linkRow.course_url || "") : editData.link1;
            editData.link2 = linkRow ? (linkRow.maintenance_url || "") : editData.link2;
            editData.link3 = linkRow ? (linkRow.safety_url || "") : editData.link3;
          }
        } catch (err) {
          console.warn("Supabase fetch mislukt, gebruik scene-props als fallback:", err);
        }
      }

      openOverlayForEdit(editData);
    };

    const supabaseReady = Boolean(W3D.Supabase && W3D.Supabase.client);
    if (!supabaseReady) {
      if (authError) {
        authError.textContent =
          W3D.Supabase && W3D.Supabase.lastInitError
            ? W3D.Supabase.lastInitError
            : 'Deze omgeving is nog niet volledig ingesteld.';
      }
      // Supabase not available → show login immediately, close preloader.
      showLoginPanel();
      if (W3D.Preloader) W3D.Preloader.finish();
    } else {
      // On SIGNED_IN: init scene (if not yet done) and show admin panel.
      // On SIGNED_OUT: show login panel.
      if (typeof onAuthStateChange === "function") {
        onAuthStateChange.call(W3D.Supabase, (event) => {
          if (event === "SIGNED_IN") {
            showAdminPanel();
            if (authError) authError.textContent = "";
          }
          if (event === "SIGNED_OUT") {
            showLoginPanel();
            if (W3D.Supabase && hasStorageControls) {
              W3D.Supabase.setControlsDisabled(true);
            }
          }
        });
      }

      const { data, error } = await W3D.Auth.getCurrentUser();
      if (error) {
        if (authError)
          authError.textContent =
            error.message || 'We konden niet controleren of je bent ingelogd.';
        // Auth error → show login, close preloader.
        showLoginPanel();
        if (W3D.Preloader) W3D.Preloader.finish();
      } else if (data && data.user) {
        // Already logged in → launch scene and admin panel.
        await showAdminPanel();
      } else {
        // Not logged in → show login form immediately, no scene or preloader.
        showLoginPanel();
        if (W3D.Preloader) W3D.Preloader.finish();
      }
    }
  } else {
    // Viewer mode: no auth panels, launch scene and restore saved machines immediately.
    await initScene();

    if (W3D.Database && W3D.Supabase && W3D.Supabase.client) {
      W3D.Database.setControlsDisabled(true);
      await W3D.Database.loadSavedMachinesIntoScene();
      // All machines loaded → remove the lock so the preloader can close.
      if (W3D.Preloader) W3D.Preloader.unlock();
    } else {
      // No database available → close preloader immediately.
      if (W3D.Preloader) W3D.Preloader.finish();
    }
  }
};

// Start the app immediately when this file is loaded by the browser.
W3D.init();
