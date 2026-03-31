/* This file starts the app when the page loads. It calls the setup functions and loads the 3D model. We need this to kick off everything. Without it, the app wouldn't run. For beginners: This is like the 'start' button that gets everything going when you open the page. */
// Import-like top-level destructure from Supabase helper in this classic script setup.
const { onAuthStateChange } = W3D.Supabase || {};

/* Application entry point - This starts the app when the page loads */
W3D.init = async function() {
  // Step 1: Build the 3D world (camera, lights, grid, renderer).
  W3D.initRenderer(); // Set up the 3D scene, camera, lights, etc.

  // Step 1b: Initialise transform tools (select, move, rotate) if available.
  if (W3D.Transform) W3D.Transform.init();

  // Step 1c: Wire view-toggle buttons in the topbar.
  const btn3d  = document.getElementById('btn-view-3d');
  const btnTop = document.getElementById('btn-view-top');
  if (btn3d)  btn3d.addEventListener('click',  () => W3D.setViewMode && W3D.setViewMode('3d'));
  if (btnTop) btnTop.addEventListener('click', () => W3D.setViewMode && W3D.setViewMode('top'));

  // Step 2: Load your default local model so the scene is not empty at start.
  // Load a local 3D model only when the file is reachable on this deployment.
  const defaultModelPath = 'models/plattegrond.glb';
  try {
    const modelCheck = await fetch(defaultModelPath, { method: 'HEAD' });
    if (modelCheck.ok || modelCheck.status === 405) {
      W3D.Factory.loadLocalGLTF(defaultModelPath);
    }
  } catch (modelErr) {
    console.warn('Default local model is not available on this deployment.', modelErr);
  }

  // Step 3: Find key UI elements for auth-driven admin view behavior.
  const loginPanel = document.getElementById('login-panel');
  const adminPanel = document.getElementById('admin-panel');
  const hasAdminAuthPanels = Boolean(loginPanel && adminPanel);
  const hasStorageControls = Boolean(document.getElementById('sb-upload-btn'));

  // Step 4: Set up upload/list/load controls before init so status errors can be shown.
  if (W3D.Supabase && hasStorageControls) {
    W3D.Supabase.setupUI();
  }

  // Step 5: Connect Supabase if this page needs auth or storage functionality.
  if (W3D.Supabase && (hasAdminAuthPanels || hasStorageControls)) {
    await W3D.Supabase.initializeFromConfig();
  }

  // Step 6: Admin authentication workflow and panel switching.
  if (hasAdminAuthPanels && W3D.Auth && W3D.Supabase) {
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const loginButton = document.getElementById('btn-auth-login');
    const registerButton = document.getElementById('btn-auth-register');
    const logoutButton = document.getElementById('btn-auth-logout');
    const authError = document.getElementById('auth-error');

    const showLoginPanel = () => {
      loginPanel.classList.remove('is-hidden');
      adminPanel.classList.add('is-hidden');
    };

    const showAdminPanel = () => {
      loginPanel.classList.add('is-hidden');
      adminPanel.classList.remove('is-hidden');
      if (W3D.Supabase && hasStorageControls) {
        W3D.Supabase.setControlsDisabled(false);
        W3D.Supabase.listFilesAndPopulateDropdown();
      }
    };

    // ── Drawer toggle (uploader sidebar) ────────────────────────────────────
    const uploaderDrawer = document.getElementById('uploader-drawer');
    const openBtn = document.getElementById('btn-open-uploader');
    const closeBtn = document.getElementById('drawer-close');

    const openDrawer = () => {
      if (uploaderDrawer) uploaderDrawer.classList.add('is-open');
      if (openBtn) openBtn.classList.add('drawer-open');
    };
    const closeDrawer = () => {
      if (uploaderDrawer) uploaderDrawer.classList.remove('is-open');
      if (openBtn) openBtn.classList.remove('drawer-open');
    };

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        // Toggle: if already open, close; otherwise open.
        uploaderDrawer && uploaderDrawer.classList.contains('is-open')
          ? closeDrawer()
          : openDrawer();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', closeDrawer);
    }

    const supabaseReady = Boolean(W3D.Supabase && W3D.Supabase.client);
    if (!supabaseReady) {
      if (authError) {
        authError.textContent = (W3D.Supabase && W3D.Supabase.lastInitError)
          ? W3D.Supabase.lastInitError
          : 'Supabase is not configured for this deployment yet.';
      }
      showLoginPanel();
    } else {
      // On SIGNED_IN: hide #login-panel, show #admin-panel.
      // On SIGNED_OUT: hide #admin-panel, show #login-panel.
      if (typeof onAuthStateChange === 'function') {
        onAuthStateChange.call(W3D.Supabase, (event) => {
          if (event === 'SIGNED_IN') {
            showAdminPanel();
            if (authError) authError.textContent = '';
          }
          if (event === 'SIGNED_OUT') {
            showLoginPanel();
            if (W3D.Supabase && hasStorageControls) {
              W3D.Supabase.setControlsDisabled(true);
            }
          }
        });
      }

      const { data, error } = await W3D.Auth.getCurrentUser();
      if (error) {
        if (authError) authError.textContent = error.message || 'Could not check current user.';
        showLoginPanel();
      } else if (data && data.user) {
        showAdminPanel();
      } else {
        showLoginPanel();
      }
    }

    if (loginButton) {
      loginButton.addEventListener('click', async () => {
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        const { error: loginError } = await W3D.Auth.login(email, password);
        if (loginError && authError) {
          authError.textContent = loginError.message || 'Login failed.';
        }
      });
    }

    if (registerButton) {
      registerButton.addEventListener('click', async () => {
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        const { error: registerError } = await W3D.Auth.register(email, password);
        if (registerError && authError) {
          authError.textContent = registerError.message || 'Register failed.';
          return;
        }
        if (authError) {
          authError.textContent = 'Registration successful. If email confirmation is enabled, verify your email before login.';
        }
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener('click', async () => {
        const { error: logoutError } = await W3D.Auth.logout();
        if (logoutError && authError) {
          authError.textContent = logoutError.message || 'Logout failed.';
        }
      });
    }
  }
};

// Start the app immediately when this file is loaded by the browser.
W3D.init();