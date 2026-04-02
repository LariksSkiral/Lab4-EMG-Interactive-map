/*
  Supabase authentication helper functions.
  All auth logic lives here, so main.js only coordinates UI state.
*/

W3D.Auth = {
  // Register a new user account with email and password.
  async register(email, password) {
    if (!W3D.Supabase || !W3D.Supabase.client) {
      const error = new Error('Supabase client is not ready for registration.');
      console.error('Auth register error:', error);
      return { data: null, error };
    }

    const { data, error } = await W3D.Supabase.client.auth.signUp({ email, password });

    if (error) {
      console.error('Auth register error:', error);
      return { data: null, error };
    }

    return { data, error: null };
  },

  // Log in with email and password.
  async login(email, password) {
    if (!W3D.Supabase || !W3D.Supabase.client) {
      const error = new Error('Supabase client is not ready for login.');
      console.error('Auth login error:', error);
      return { data: null, error };
    }

    const { data, error } = await W3D.Supabase.client.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('Auth login error:', error);
      return { data: null, error };
    }

    return { data, error: null };
  },

  // Log out the current user session.
  async logout() {
    if (!W3D.Supabase || !W3D.Supabase.client) {
      const error = new Error('Supabase client is not ready for logout.');
      console.error('Auth logout error:', error);
      return { data: null, error };
    }

    const { data, error } = await W3D.Supabase.client.auth.signOut();

    if (error) {
      console.error('Auth logout error:', error);
      return { data: null, error };
    }

    return { data, error: null };
  },

  // Get the current authenticated user from Supabase.
  async getCurrentUser() {
    if (!W3D.Supabase || !W3D.Supabase.client) {
      const error = new Error('Supabase client is not ready to get current user.');
      console.error('Auth getCurrentUser error:', error);
      return { data: null, error };
    }

    const { data, error } = await W3D.Supabase.client.auth.getUser();

    if (error) {
      console.error('Auth getCurrentUser error:', error);
      return { data: null, error };
    }

    return { data, error: null };
  },
};
