
/*
 * CampusShield AI — Supabase backend helper
 */
(() => {
  "use strict";

  const cfg = window.CAMPUSSHIELD_SUPABASE_CONFIG || {};

  const ready = Boolean(
    window.supabase &&
    typeof window.supabase.createClient === "function" &&
    cfg.url &&
    !cfg.url.includes("YOUR-PROJECT-REF") &&
    cfg.publishableKey &&
    !cfg.publishableKey.includes("REPLACE_ME")
  );

  const client = ready
    ? window.supabase.createClient(cfg.url, cfg.publishableKey)
    : null;

  window.CampusShieldBackend = {
    isConfigured: ready,
    client,
 
async signUp(email, password, displayName, username) {
  if (!client) throw new Error("Supabase is not configured.");

  return client.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || "", username: String(username || "").trim().toLowerCase() },
      emailRedirectTo:
        "https://campusshield-ai.github.io/campusshield-ai/"
    }
  });
},

async resendConfirmation(email) {
  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  if (!email || !email.trim()) {
    throw new Error("Enter your email address.");
  }

  return client.auth.resend({
    type: "signup",
    email: email.trim(),
    options: {
      emailRedirectTo:
        "https://campusshield-ai.github.io/campusshield-ai/"
    }
  });
},

    async signIn(email, password) {
      if (!client) throw new Error("Supabase is not configured.");

      return client.auth.signInWithPassword({ email, password });
    },

    async signOut() {
      if (!client) throw new Error("Supabase is not configured.");

      return client.auth.signOut();
    },

async getCurrentUser() {
  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await client.auth.getUser();

  if (error) throw error;

  return data.user || null;
},


    async saveRequestedRole(requestedRole) {
      if (!client) throw new Error("Supabase is not configured.");

      if (!["student", "teacher"].includes(requestedRole)) {
        throw new Error("Invalid requested role.");
      }

      return client.rpc("save_my_requested_role", {
        p_requested_role: requestedRole
      });
    },

    async getMyCommunityProfile() {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client.rpc("get_my_community_profile");
      if (error) throw error;
      return Array.isArray(data) ? (data[0] || null) : data;
    },

    async checkCommunityUsernameAvailable(username) {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client.rpc("check_community_username_available", {
        p_username: String(username || "").trim().toLowerCase()
      });
      if (error) throw error;
      return data === true;
    },

    async setMyCommunityUsername(username) {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client.rpc("set_my_community_username", {
        p_username: String(username || "").trim().toLowerCase()
      });
      if (error) throw error;
      return data;
    },

    async listCommunityPosts() {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client
        .from("community_posts")
        .select("id, author_username, post_type, title, body, location, status, is_official, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },

    async createCommunityPost(input) {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client.rpc("create_community_post", {
        p_post_type: input.postType,
        p_title: input.title,
        p_body: input.body,
        p_location: input.location || null
      });
      if (error) throw error;
      return data;
    },

    async listCommunityComments(postIds) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!Array.isArray(postIds) || postIds.length === 0) return [];

      const { data, error } = await client
        .from("community_comments")
        .select("id, post_id, author_username, body, status, created_at, updated_at")
        .in("post_id", postIds)
        .eq("status", "published")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async createCommunityComment(postId, body) {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client.rpc("create_community_comment", {
        p_post_id: postId,
        p_body: body
      });
      if (error) throw error;
      return data;
    },

    async reportCommunityContent(targetType, targetId, reason, details) {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client.rpc("report_community_content", {
        p_target_type: targetType,
        p_target_id: targetId,
        p_reason: reason,
        p_details: details || null
      });
      if (error) throw error;
      return data;
    },

    async listCommunityModerationPosts() {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client
        .from("community_posts")
        .select("id, author_username, post_type, title, body, location, status, is_official, created_at, updated_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async moderateCommunityPost(postId, decision) {
      if (!client) throw new Error("Supabase is not configured.");

      const { error } = await client.rpc("moderate_community_post", {
        p_post_id: postId,
        p_decision: decision
      });
      if (error) throw error;
    },

    async listCommunityReports() {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client
        .from("community_reports")
        .select("id, target_type, post_id, comment_id, reason, details, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async moderateCommunityComment(commentId, decision) {
      if (!client) throw new Error("Supabase is not configured.");

      const { error } = await client.rpc("moderate_community_comment", {
        p_comment_id: commentId,
        p_decision: decision
      });
      if (error) throw error;
    },

    async resolveCommunityReport(reportId, decision) {
      if (!client) throw new Error("Supabase is not configured.");

      const { error } = await client.rpc("resolve_community_report", {
        p_report_id: reportId,
        p_decision: decision
      });
      if (error) throw error;
    },

    async listIncidents() {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client
        .from("incidents")
        .select(
          "id, category, severity, location, description, status, created_at, updated_at"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },

    async createIncident(input) {
      if (!client) throw new Error("Supabase is not configured.");

      const user = await this.getCurrentUser();
      if (!user) {
        throw new Error("Please sign in before submitting an incident.");
      }

      const { data, error } = await client
        .from("incidents")
        .insert({
          reporter_id: user.id,
          category: input.category,
          severity: input.severity,
          location: input.location,
          description: input.description
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async updateIncidentStatus(id, status) {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client
        .from("incidents")
        .update({ status })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async deleteIncident(id) {
      if (!client) throw new Error("Supabase is not configured.");

      const { error } = await client
        .from("incidents")
        .delete()
        .eq("id", id);

      if (error) throw error;
    }
  };

  console.info(
    "CampusShield backend loaded. Supabase configured:",
    ready
  );
})();
