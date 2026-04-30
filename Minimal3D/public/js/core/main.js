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

  // Step 1: Build the 3D world (camera, lights, grid, renderer).
  W3D.initRenderer(); // Set up the 3D scene, camera, lights, etc.

  // Step 1b: Initialise transform tools (select, move, rotate) if available.
  if (W3D.Transform) W3D.Transform.init();

  // Step 1c: Prepare database UI early so buttons can be enabled/disabled later.
  if (W3D.Database) W3D.Database.setupUI();

  // Step 1d: Wire view-toggle buttons in the topbar.
  const btn3d = document.getElementById("btn-view-3d");
  const btnTop = document.getElementById("btn-view-top");
  if (btn3d)
    btn3d.addEventListener(
      "click",
      () => W3D.setViewMode && W3D.setViewMode("3d"),
    );
  if (btnTop)
    btnTop.addEventListener(
      "click",
      () => W3D.setViewMode && W3D.setViewMode("top"),
    );

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
      if (!selectedMachine || !selectedMachine.props) return null;

      const links = {
        course: selectedMachine.props.link1 || selectedMachine.props.courseLink || null,
        maintenance: selectedMachine.props.link2 || selectedMachine.props.maintenanceLink || null,
        safety: selectedMachine.props.link3 || selectedMachine.props.safetyLink || null,
      };

      return links[action] || null;
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

  // Step 2: Load your default local model so the scene is not empty at start.
  // Load a local 3D model only when the file is reachable on this deployment.
  const defaultModelPath = "models/plattegrond.glb";
  try {
    const modelCheck = await fetch(defaultModelPath, { method: "HEAD" });
    if (modelCheck.ok || modelCheck.status === 405) {
      W3D.Factory.loadLocalGLTF(defaultModelPath);
    }
  } catch (modelErr) {
    console.warn(
      "Default local model is not available on this deployment.",
      modelErr,
    );
  }

  // Step 3: Find key UI elements for auth-driven admin view behavior.
  const loginPanel = document.getElementById("login-panel");
  const adminPanel = document.getElementById("admin-panel");
  const hasAdminAuthPanels = Boolean(loginPanel && adminPanel);
  const hasStorageControls = Boolean(
    document.getElementById("sb-file-list") ||
      document.getElementById("sb-load-btn") ||
      document.getElementById("sb-refresh-btn"),
  );
  const hasDatabaseFeatures = Boolean(W3D.Database);

  // Step 4: Set up model-library controls before init so status errors can be shown.
  if (W3D.Supabase && hasStorageControls) {
    W3D.Supabase.setupUI();
  }

  // Step 5: Connect Supabase if this page needs auth, storage, or database reads/writes.
  if (
    W3D.Supabase &&
    (hasAdminAuthPanels || hasStorageControls || hasDatabaseFeatures)
  ) {
    await W3D.Supabase.initializeFromConfig();
  }

  // Step 6: Admin authentication workflow and panel switching.
  if (hasAdminAuthPanels && W3D.Auth && W3D.Supabase) {
    const emailInput = document.getElementById("auth-email");
    const passwordInput = document.getElementById("auth-password");
    const loginButton = document.getElementById("btn-auth-login");
    const registerButton = document.getElementById("btn-auth-register");
    const logoutButton = document.getElementById("btn-auth-logout");
    const authError = document.getElementById("auth-error");

    const showLoginPanel = () => {
      loginPanel.classList.remove("is-hidden");
      adminPanel.classList.add("is-hidden");
      if (W3D.Database) {
        W3D.Database.setControlsDisabled(true);
      }
    };

    const showAdminPanel = async () => {
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

    const closeOverlay = () => {
      if (machineOverlay) machineOverlay.classList.remove("is-open");
      if (uploaderDrawer) uploaderDrawer.classList.remove("is-expanded");
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
      if (saveMachineBtn) saveMachineBtn.disabled = !(hasName && hasModel);
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

    // Save machine logic
    if (saveMachineBtn) {
      saveMachineBtn.addEventListener("click", async () => {
        const machineName = machineNameInput ? machineNameInput.value.trim() : "";
        const link1 = link1Input ? link1Input.value.trim() : "";
        const link2 = link2Input ? link2Input.value.trim() : "";
        const link3 = link3Input ? link3Input.value.trim() : "";

        if (!machineName || !selectedModelFile || !W3D.Supabase || !W3D.Database) {
          return;
        }

        saveMachineBtn.disabled = true;
        if (machineStatus) {
          machineStatus.textContent = 'Machine wordt opgeslagen...';
          machineStatus.classList.remove("is-ok");
          machineStatus.classList.remove("is-error");
        }

        try {
          if (!W3D.Supabase.client) {
            throw new Error(
              W3D.Supabase.lastInitError || 'De opslag is op dit moment niet beschikbaar.',
            );
          }

          await W3D.Database.createMachineTypeWithFile({
            name: machineName,
            file: selectedModelFile,
            links: [link1, link2, link3],
          });

          if (W3D.Supabase.listFilesAndPopulateDropdown) {
            await W3D.Supabase.listFilesAndPopulateDropdown();
          }

          if (machineStatus) {
            machineStatus.textContent = `Machine "${machineName}" is opgeslagen.`;
            machineStatus.classList.remove("is-error");
            machineStatus.classList.add("is-ok");
          }

          if (machineNameInput) machineNameInput.value = "";
          if (link1Input) link1Input.value = "";
          if (link2Input) link2Input.value = "";
          if (link3Input) link3Input.value = "";
          clearModelFile();

          setTimeout(() => {
            closeOverlay();
            openDrawer();
          }, 2000);
        } catch (error) {
          console.error("Error saving machine:", error);
          if (machineStatus) {
            machineStatus.textContent = friendlyClientMessage(error, 'Het opslaan van de machine is niet gelukt.');
            machineStatus.classList.remove("is-ok");
            machineStatus.classList.add("is-error");
          }
        } finally {
          saveMachineBtn.disabled = false;
        }
      });
    }

    const supabaseReady = Boolean(W3D.Supabase && W3D.Supabase.client);
    if (!supabaseReady) {
      if (authError) {
        authError.textContent =
          W3D.Supabase && W3D.Supabase.lastInitError
            ? W3D.Supabase.lastInitError
            : 'Deze omgeving is nog niet volledig ingesteld.';
      }
      showLoginPanel();
    } else {
      // On SIGNED_IN: hide #login-panel, show #admin-panel.
      // On SIGNED_OUT: hide #admin-panel, show #login-panel.
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
        showLoginPanel();
      } else if (data && data.user) {
        await showAdminPanel();
      } else {
        showLoginPanel();
      }
    }
  } else if (W3D.Database && W3D.Supabase && W3D.Supabase.client) {
    // Viewer mode has no auth panels, so we restore saved machines immediately.
    W3D.Database.setControlsDisabled(true);
    await W3D.Database.loadSavedMachinesIntoScene();
  }
};

// Start the app immediately when this file is loaded by the browser.
W3D.init();
