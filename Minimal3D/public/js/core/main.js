/* This file starts the app when the page loads. It calls the setup functions and loads the 3D model. We need this to kick off everything. Without it, the app wouldn't run. For beginners: This is like the 'start' button that gets everything going when you open the page. */
// Import-like top-level destructure from Supabase helper in this classic script setup.
const { onAuthStateChange } = W3D.Supabase || {};

/* Application entry point - This starts the app when the page loads */
W3D.init = async function () {
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
  const hasStorageControls = Boolean(document.getElementById("sb-upload-btn"));
  const hasDatabaseFeatures = Boolean(W3D.Database);

  // Step 4: Set up upload/list/load controls before init so status errors can be shown.
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
          authError.textContent = loginError.message || "Login failed.";
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
          authError.textContent = registerError.message || "Register failed.";
          return;
        }
        if (authError) {
          authError.textContent =
            "Registration successful. If email confirmation is enabled, verify your email before login.";
        }
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        const { error: logoutError } = await W3D.Auth.logout();
        if (logoutError && authError) {
          authError.textContent = logoutError.message || "Logout failed.";
        }
      });
    }

    // ── Overlay toggle (machine toevoegen) ─────────────────────────────────
    const machineOverlay = document.getElementById("machine-overlay");
    const openBtn = document.getElementById("btn-open-uploader");
    const closeBtn = document.getElementById("overlay-close");

    const openOverlay = () => {
      if (machineOverlay) machineOverlay.classList.add("is-open");
      if (openBtn) openBtn.classList.add("overlay-open");
    };
    const closeOverlay = () => {
      if (machineOverlay) machineOverlay.classList.remove("is-open");
      if (openBtn) openBtn.classList.remove("overlay-open");
    };

    if (openBtn) {
      openBtn.addEventListener("click", () => {
        // Toggle: if already open, close; otherwise open.
        machineOverlay && machineOverlay.classList.contains("is-open")
          ? closeOverlay()
          : openOverlay();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", closeOverlay);
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
      const machineName = document.getElementById("machine-name").value.trim();
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
    const machineNameInput = document.getElementById("machine-name");
    if (machineNameInput) {
      machineNameInput.addEventListener("input", updateSaveButton);
    }

    // Save machine logic
    if (saveMachineBtn) {
      saveMachineBtn.addEventListener("click", async () => {
        const machineName = machineNameInput.value.trim();
        const link1 = document.getElementById("link1").value.trim();
        const link2 = document.getElementById("link2").value.trim();
        const link3 = document.getElementById("link3").value.trim();

        if (!machineName || !selectedModelFile) return;

        saveMachineBtn.disabled = true;
        if (machineStatus) {
          machineStatus.textContent = "Machine opslaan...";
          machineStatus.classList.remove("is-error");
        }

        try {
          // Upload model to Supabase
          const storagePath = W3D.Supabase._buildStoragePath(
            selectedModelFile.name,
          );
          const { data, error: uploadError } = await W3D.Supabase.client.storage
            .from(W3D.Supabase.config.bucket)
            .upload(storagePath, selectedModelFile);

          if (uploadError) throw uploadError;

          // Here you would save machine data to database
          // For now, just show success
          if (machineStatus) {
            machineStatus.textContent = `Machine "${machineName}" succesvol opgeslagen!`;
            machineStatus.classList.add("is-ok");
          }

          // Reset form
          machineNameInput.value = "";
          document.getElementById("link1").value = "";
          document.getElementById("link2").value = "";
          document.getElementById("link3").value = "";
          clearModelFile();

          // Close overlay after short delay
          setTimeout(() => {
            closeOverlay();
          }, 2000);
        } catch (error) {
          console.error("Error saving machine:", error);
          if (machineStatus) {
            machineStatus.textContent = `Fout bij opslaan: ${error.message}`;
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
            : "Supabase is not configured for this deployment yet.";
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
            error.message || "Could not check current user.";
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
