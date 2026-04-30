/*
  Supabase authentication helper functions.
  All auth logic lives here, so main.js only coordinates UI state.
*/

W3D.Auth = {
  _friendlyAuthError(error, fallbackMessage) {
    const rawMessage = String((error && error.message) || '').toLowerCase();

    if (!rawMessage) return fallbackMessage;
    if (rawMessage.includes('invalid login')) {
      return 'De combinatie van e-mailadres en wachtwoord klopt niet.';
    }
    if (rawMessage.includes('email not confirmed')) {
      return 'Bevestig eerst je e-mailadres voordat je inlogt.';
    }
    if (rawMessage.includes('user already registered')) {
      return 'Voor dit e-mailadres bestaat al een account.';
    }
    if (rawMessage.includes('password should be at least')) {
      return 'Gebruik een wachtwoord van minimaal 6 tekens.';
    }
    if (rawMessage.includes('network') || rawMessage.includes('fetch')) {
      return 'Er kon geen verbinding worden gemaakt. Probeer het opnieuw.';
    }

    return fallbackMessage;
  },

  // Register a new user account with email and password.
  async register(email, password) {
    if (!W3D.Supabase || !W3D.Supabase.client) {
      const error = new Error('De inlogservice is op dit moment niet beschikbaar.');
      console.error('Auth register error:', error);
      return { data: null, error };
    }

    const { data, error } = await W3D.Supabase.client.auth.signUp({ email, password });

    if (error) {
      console.error('Auth register error:', error);
      return { data: null, error: new Error(this._friendlyAuthError(error, 'Het aanmaken van het account is niet gelukt.')) };
    }

    return { data, error: null };
  },

  // Log in with email and password.
  async login(email, password) {
    if (!W3D.Supabase || !W3D.Supabase.client) {
      const error = new Error('De inlogservice is op dit moment niet beschikbaar.');
      console.error('Auth login error:', error);
      return { data: null, error };
    }

    const { data, error } = await W3D.Supabase.client.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('Auth login error:', error);
      return { data: null, error: new Error(this._friendlyAuthError(error, 'Inloggen is niet gelukt. Probeer het opnieuw.')) };
    }

    return { data, error: null };
  },

  // Log out the current user session.
  async logout() {
    if (!W3D.Supabase || !W3D.Supabase.client) {
      const error = new Error('Uitloggen is op dit moment niet beschikbaar.');
      console.error('Auth logout error:', error);
      return { data: null, error };
    }

    const { data, error } = await W3D.Supabase.client.auth.signOut();

    if (error) {
      console.error('Auth logout error:', error);
      return { data: null, error: new Error(this._friendlyAuthError(error, 'Uitloggen is niet gelukt. Probeer het opnieuw.')) };
    }

    return { data, error: null };
  },

  // Get the current authenticated user from Supabase.
  async getCurrentUser() {
    if (!W3D.Supabase || !W3D.Supabase.client) {
      const error = new Error('De inlogservice is op dit moment niet beschikbaar.');
      console.error('Auth getCurrentUser error:', error);
      return { data: null, error };
    }

    const { data, error } = await W3D.Supabase.client.auth.getUser();

    if (error) {
      console.error('Auth getCurrentUser error:', error);
      return { data: null, error: new Error(this._friendlyAuthError(error, 'We konden niet controleren of je bent ingelogd.')) };
    }

    return { data, error: null };
  },
};
