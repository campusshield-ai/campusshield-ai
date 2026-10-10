/*
 * CampusShield AI — Supabase connection helper
 * Include supabase-config.js, the Supabase v2 CDN, then this file.
 * This module intentionally does not automatically change the current demo UI.
 * Integrate its methods into the existing incident form after configuring the project.
 */
(() => {
  const cfg = window.CAMPUSSHIELD_SUPABASE_CONFIG || {};
  const ready = Boolean(
    window.supabase &&
    cfg.url && !cfg.url.includes("YOUR-PROJECT-REF") &&
    cfg.publishableKey && !cfg.publishableKey.includes("REPLACE_ME")
  );

  window.CampusShieldBackend = {
    isConfigured: ready,
    client: ready ? window.supabase.createClient(cfg.url, cfg.publishableKey) : null,

    async signUp(email, password, displayName) {
      if (!this.client) throw new Error("Configure Supabase URL and publishable key first.");
      return this.client.auth.signUp({
        email, password,
        options: { data: { display_name: displayName || "" } }
      });
    },

    async signIn(email, password) {
      if (!this.client) throw new Error("Configure Supabase URL and publishable key first.");
      return this.client.auth.signInWithPassword({ email, password });
    },

    async signOut() {
      if (!this.client) return { error: null };
      return this.client.auth.signOut();
    },

    async getCurrentUser() {
      if (!this.client) return null;
      const { data, error } = await this.client.auth.getUser();
      if (error) throw error;
      return data.user;
    },

    async listIncidents() {
      if (!this.client) throw new Error("Configure Supabase URL and publishable key first.");
      const { data, error } = await this.client
        .from("incidents")
        .select("id, reporter_id, category, severity, location, description, status, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async createIncident(input) {
      if (!this.client) throw new Error("Configure Supabase URL and publishable key first.");
      const user = await this.getCurrentUser();
      if (!user) throw new Error("Please sign in before submitting an incident.");
      const row = {
        reporter_id: user.id,
        category: input.category,
        severity: input.severity,
        location: input.location,
        description: input.description
      };
      const { data, error } = await this.client
        .from("incidents")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async updateIncidentStatus(id, status) {
      if (!this.client) throw new Error("Configure Supabase URL and publishable key first.");
      const { data, error } = await this.client
        .from("incidents")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async deleteIncident(id) {
      if (!this.client) throw new Error("Configure Supabase URL and publishable key first.");
      const { error } = await this.client.from("incidents").delete().eq("id", id);
      if (error) throw error;
    }
  };
})();
