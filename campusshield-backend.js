
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
 
async signUp(email, password, displayName, username, universityId) {
  if (!client) throw new Error("Supabase is not configured.");

  return client.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || "", username: String(username || "").trim().toLowerCase(), university_id: universityId || null },
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

    async listCampusUniversities() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client
        .from("campus_universities")
        .select("id, name, slug, ownership, state")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data || [];
    },

    async bootstrapFirstCampusAdmin(universityId) {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("bootstrap_first_campus_admin", {
        p_university_id: universityId
      });
      if (error) throw error;
      return data === true;
    },

    async listCampusStaffMembershipReviews() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("list_campus_staff_membership_reviews");
      if (error) throw error;
      return data || [];
    },

    async reviewCampusStaffMembership(userId, decision) {
      if (!client) throw new Error("Supabase is not configured.");
      const { error } = await client.rpc("review_campus_staff_membership", {
        p_user_id: userId,
        p_decision: decision
      });
      if (error) throw error;
    },

    async getMyCampusContext() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("get_my_campus_context");
      if (error) throw error;
      return Array.isArray(data) ? (data[0] || null) : data;
    },

    async setMyCampusMembership(input) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!input || !input.universityId) throw new Error("Choose your university.");
      const { data, error } = await client.rpc("set_my_campus_membership", {
        p_university_id: input.universityId,
        p_faculty: input.faculty || null,
        p_department: input.department || null,
        p_course: input.course || null,
        p_year_of_study: input.yearOfStudy || null
      });
      if (error) throw error;
      return data;
    },

    async requestCampusUniversity(input) {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("request_campus_university", {
        p_university_name: input.name,
        p_state: input.state,
        p_ownership: input.ownership,
        p_official_website: input.website || null
      });
      if (error) throw error;
      return data;
    },

    async getMyCommunityProfile() {
      if (!client) throw new Error("Supabase is not configured.");

      const { data, error } = await client.rpc("get_my_community_profile");
      if (error) throw error;
      return Array.isArray(data) ? (data[0] || null) : data;
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
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },

    async createCommunityPost(input) {
      if (!client) throw new Error("Supabase is not configured.");
      let data, error;
      if (input.postType === "poll") {
        ({ data, error } = await client.rpc("create_community_poll", {
          p_title: input.title,
          p_body: input.body,
          p_option_1: input.options?.[0] || "",
          p_option_2: input.options?.[1] || "",
          p_option_3: input.options?.[2] || null,
          p_option_4: input.options?.[3] || null,
          p_location: input.location || null
        }));
      } else if (["campus_update", "question", "lost_found"].includes(input.postType)) {
        ({ data, error } = await client.rpc("create_campus_social_post", {
          p_post_type: input.postType,
          p_title: input.title,
          p_body: input.body,
          p_location: input.location || null
        }));
      } else {
        ({ data, error } = await client.rpc("create_community_post", {
          p_post_type: input.postType,
          p_title: input.title,
          p_body: input.body,
          p_location: input.location || null
        }));
      }
      if (error) throw error;
      return data;
    },

    async getCommunityPostSocial(postIds) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!Array.isArray(postIds) || !postIds.length) return [];
      const { data, error } = await client.rpc("get_community_post_social", {
        p_post_ids: postIds.slice(0, 50)
      });
      if (error) throw error;
      return data || [];
    },

    async toggleCommunityReaction(postId, reactionType = "like") {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("toggle_community_reaction", {
        p_post_id: postId,
        p_reaction_type: reactionType
      });
      if (error) throw error;
      return data;
    },

    async toggleCommunityBookmark(postId) {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("toggle_community_bookmark", {
        p_post_id: postId
      });
      if (error) throw error;
      return data === true;
    },

    async getCommunityPollData(postId) {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("get_community_poll_data", {
        p_post_id: postId
      });
      if (error) throw error;
      return data || [];
    },

    async voteCommunityPoll(postId, optionId) {
      if (!client) throw new Error("Supabase is not configured.");
      const { error } = await client.rpc("vote_community_poll", {
        p_post_id: postId,
        p_option_id: optionId
      });
      if (error) throw error;
    },

    async createCommunityReply(postId, parentCommentId, body) {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("create_community_reply", {
        p_post_id: postId,
        p_parent_comment_id: parentCommentId,
        p_body: body
      });
      if (error) throw error;
      return data;
    },

    async repostCommunityPost(postId) {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("repost_community_post", {
        p_post_id: postId
      });
      if (error) throw error;
      return data;
    },

    async toggleCampusFollow(userId, follow) {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("toggle_campus_follow", {
        p_followed_id: userId,
        p_follow: Boolean(follow)
      });
      if (error) throw error;
      return data === true;
    },

    async toggleCampusFollowPostAuthor(postId, follow) {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("toggle_campus_follow_post_author", {
        p_post_id: postId,
        p_follow: Boolean(follow)
      });
      if (error) throw error;
      return data === true;
    },

    async listCommunityComments(postIds) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!Array.isArray(postIds) || postIds.length === 0) return [];

      const { data, error } = await client
        .from("community_comments")
        .select("id, post_id, author_username, parent_comment_id, body, status, created_at, updated_at")
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

    async listCampusGroups() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.from("campus_groups")
        .select("id,university_id,name,description,group_type,privacy,status,creator_username,created_at")
        .eq("status", "active").order("name", { ascending: true }).limit(100);
      if (error) throw error;
      return data || [];
    },

    async listMyCampusGroupMemberships() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("list_my_campus_group_memberships");
      if (error) throw error;
      return (data || []).map(row => row.group_id);
    },

    async createCampusGroup(input) {
      if (!client) throw new Error("Supabase is not configured.");
      const user = await this.getCurrentUser();
      const campus = await this.getMyCampusContext();
      if (!user || !campus?.university_id) throw new Error("Sign in and choose your university first.");
      const { data, error } = await client.from("campus_groups").insert({
        university_id: campus.university_id, created_by: user.id, name: input.name,
        description: input.description || null, group_type: input.groupType,
        privacy: input.privacy || "campus", status: "pending"
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },

    async joinCampusGroup(groupId) {
      if (!client) throw new Error("Supabase is not configured.");
      const { error } = await client.rpc("join_campus_group", { p_group_id: groupId });
      if (error) throw error;
    },

    async leaveCampusGroup(groupId) {
      if (!client) throw new Error("Supabase is not configured.");
      const { error } = await client.rpc("leave_campus_group", { p_group_id: groupId });
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
      const campus = await this.getMyCampusContext();
      if (!campus?.university_id) {
        throw new Error("Choose your university in Campus community before submitting a report.");
      }

      const { data, error } = await client
        .from("incidents")
        .insert({
          reporter_id: user.id,
          university_id: campus.university_id,
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
