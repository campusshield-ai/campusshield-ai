
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
 
async signUp(email, password, displayName, username, universityId, profileData = {}) {
  if (!client) throw new Error("Supabase is not configured.");
  const safeProfileData = profileData && typeof profileData === "object" ? profileData : {};

  return client.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || "",
        username: String(username || "").trim().toLowerCase(),
        university_id: universityId || null,
        requested_role: safeProfileData.requested_role || "student",
        faculty: safeProfileData.faculty || null,
        department: safeProfileData.department || null,
        course: safeProfileData.course || null,
        year_of_study: safeProfileData.year_of_study || null,
        campus_position: safeProfileData.campus_position || null,
        campus_staff_number: safeProfileData.campus_staff_number || null,
        campus_official_email: safeProfileData.campus_official_email || null,
        requested_campus_admin: Boolean(safeProfileData.requested_campus_admin)
      },
      emailRedirectTo: window.location.origin + window.location.pathname
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
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  });
},

    async requestPasswordReset(email, redirectTo) {
      if (!client) throw new Error("Supabase is not configured.");
      const normalizedEmail = String(email || "").trim();
      if (!normalizedEmail) throw new Error("Enter the email address for your account.");
      if (!redirectTo || !/^https?:\/\//i.test(redirectTo)) {
        throw new Error("The password-reset return URL is not valid.");
      }

      return client.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
    },

    async updatePassword(password) {
      if (!client) throw new Error("Supabase is not configured.");
      if (typeof password !== "string" || password.length < 8) {
        throw new Error("Choose a password with at least 8 characters.");
      }

      return client.auth.updateUser({ password });
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

    async submitCampusStaffVerification(input) {
      if (!client) throw new Error("Supabase is not configured.");
      const user = await this.getCurrentUser();
      if (!user) throw new Error("Sign in before submitting staff verification.");
      const positionTitle = String(input?.positionTitle || user.user_metadata?.campus_position || "").trim();
      const staffNumber = String(input?.staffNumber || user.user_metadata?.campus_staff_number || "").trim();
      const officialEmail = String(input?.officialEmail || user.user_metadata?.campus_official_email || "").trim().toLowerCase();
      const requestedCampusAdmin = Boolean(input?.requestedCampusAdmin ?? user.user_metadata?.requested_campus_admin);
      let documentPath = null;

      if (input?.document) {
        const file = input.document;
        const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
        if (!allowedTypes.has(file.type)) throw new Error("Use a PDF, JPG, or PNG staff ID document.");
        if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("Staff ID documents must be 5 MiB or smaller.");
        // Derive the storage extension from the validated MIME type, not the user-supplied filename.
        // This keeps extension-based Storage policies aligned with the accepted content type.
        const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/jpeg" ? "jpg" : "png";
        const cleanedBase = String(file.name || "staff-id")
          .replace(/\\.[^.]*$/, "")
          .normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(-70) || "staff-id";
        documentPath = user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 10) + "-" + cleanedBase + "." + extension;
        const { error: uploadError } = await client.storage.from("campus-staff-documents").upload(documentPath, file, {
          cacheControl: "3600", upsert: false, contentType: file.type
        });
        if (uploadError) throw uploadError;
      }

      try {
        const { error } = await client.rpc("submit_campus_staff_verification", {
          p_position_title: positionTitle,
          p_staff_number: staffNumber || null,
          p_official_email: officialEmail || null,
          p_document_path: documentPath,
          p_requested_campus_admin: requestedCampusAdmin
        });
        if (error) throw error;
      } catch (error) {
        if (documentPath) await client.storage.from("campus-staff-documents").remove([documentPath]).catch(() => {});
        throw error;
      }
      return { status: "pending", documentPath };
    },

    async getMyCampusStaffVerification() {
      if (!client) throw new Error("Supabase is not configured.");
      const user = await this.getCurrentUser();
      if (!user) throw new Error("Sign in before checking staff verification.");
      const { data, error } = await client.from("campus_staff_verifications")
        .select("position_title, staff_number, official_email, requested_campus_admin, status, rejection_reason, created_at")
        .eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async listCampusStaffVerificationReviews() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("list_campus_staff_verification_reviews");
      if (error) throw error;
      return data || [];
    },

    async reviewCampusStaffVerification(userId, decision, reason = null) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!userId || !["approve", "reject"].includes(decision)) throw new Error("Choose a staff application and a valid decision.");
      const { error } = await client.rpc("review_campus_staff_verification", {
        p_user_id: userId, p_decision: decision, p_rejection_reason: reason
      });
      if (error) throw error;
    },

    async recordCampusIdentityEvidenceCheck({ userId, evidenceType, outcome, sourceKind, sourceReference = null, reviewerNote = null }) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!userId) throw new Error("Choose an account to review.");
      const allowedTypes = ["student_id", "staff_id", "payment_receipt"];
      const allowedOutcomes = ["needs_review", "institution_confirmed", "not_confirmed"];
      const allowedSources = ["document_visual_review", "official_university_email", "university_registry", "direct_institution_contact", "official_payment_portal", "other"];
      if (!allowedTypes.includes(evidenceType) || !allowedOutcomes.includes(outcome) || !allowedSources.includes(sourceKind)) {
        throw new Error("Choose a valid evidence type, outcome, and source.");
      }
      if (outcome === "institution_confirmed" && (!["official_university_email", "university_registry", "direct_institution_contact", "official_payment_portal"].includes(sourceKind) || !String(sourceReference || "").trim())) {
        throw new Error("Institution confirmation requires an authoritative source and reference.");
      }
      const { data, error } = await client.rpc("record_campus_identity_evidence_check", {
        p_subject_user_id: userId,
        p_evidence_type: evidenceType,
        p_outcome: outcome,
        p_source_kind: sourceKind,
        p_source_reference: sourceReference || null,
        p_reviewer_note: reviewerNote || null
      });
      if (error) throw error;
      return data;
    },

    async listCampusIdentityEvidenceChecks(userId = null) {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("list_campus_identity_evidence_checks", {
        p_subject_user_id: userId || null
      });
      if (error) throw error;
      return data || [];
    },

    async createCampusStaffDocumentUrl(path) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!path) return null;
      const { data, error } = await client.storage.from("campus-staff-documents").createSignedUrl(path, 90);
      if (error) throw error;
      return data?.signedUrl || null;
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

    async isPlatformAdmin() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("platform_is_admin");
      if (error) throw error;
      return data === true;
    },

    async listPlatformCampusAdminRequests() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("platform_list_campus_admin_requests");
      if (error) throw error;
      return data || [];
    },

    async listPlatformUniversityRequests() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("platform_list_campus_university_requests");
      if (error) throw error;
      return data || [];
    },

    async reviewPlatformUniversityRequest(requestId, decision) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!["approve", "reject"].includes(decision)) throw new Error("Choose approve or reject.");
      const { error } = await client.rpc("platform_review_campus_university_request", {
        p_request_id: requestId,
        p_decision: decision
      });
      if (error) throw error;
    },

    async listPlatformCampusStaffCandidates(universityId) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!universityId) return [];
      const { data, error } = await client.rpc("platform_list_campus_staff_candidates", {
        p_university_id: universityId
      });
      if (error) throw error;
      return data || [];
    },

    async assignCampusAdmin(userId, universityId) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!userId || !universityId) throw new Error("Choose a staff account and university.");
      const { error } = await client.rpc("platform_assign_campus_admin", {
        p_user_id: userId,
        p_university_id: universityId
      });
      if (error) throw error;
    },

    async uploadCommunityPostMedia(postId, files, altText) {
      if (!client) throw new Error("Supabase is not configured.");
      const user = await this.getCurrentUser();
      const campus = await this.getMyCampusContext();
      if (!user || !campus?.university_id) throw new Error("Sign in and choose your university before uploading media.");
      if (!postId) throw new Error("Create the campus post before attaching media.");

      const selected = Array.from(files || []);
      if (selected.length > 4) throw new Error("Attach no more than four files to one post.");
      const allowedTypes = new Set([
        "image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"
      ]);
      const bucket = client.storage.from("campus-community-media");

      for (const file of selected) {
        if (!allowedTypes.has(file.type)) {
          throw new Error("Use JPG, PNG, WEBP, GIF, MP4, or WEBM files only.");
        }
        if (!file.size || file.size > 50 * 1024 * 1024) {
          throw new Error("Each image or video must be 50 MB or smaller.");
        }

        const cleanedName = String(file.name || "attachment")
          .normalize("NFKD")
          .replace(/[^a-zA-Z0-9._-]+/g, "_")
          .slice(-90) || "attachment";
        const objectPath = campus.university_id + "/" + postId + "/" +
          Date.now() + "-" + Math.random().toString(36).slice(2, 10) + "-" + cleanedName;

        const { error: uploadError } = await bucket.upload(objectPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type
        });
        if (uploadError) throw uploadError;

        const { error: metadataError } = await client.from("community_post_media").insert({
          post_id: postId,
          university_id: campus.university_id,
          uploader_id: user.id,
          object_path: objectPath,
          media_kind: file.type.startsWith("video/") ? "video" : "image",
          mime_type: file.type,
          byte_size: file.size,
          alt_text: String(altText || "").trim().slice(0, 250) || null
        });
        if (metadataError) {
          await bucket.remove([objectPath]);
          throw metadataError;
        }
      }
      return selected.length;
    },

    async listCommunityPostMedia(postIds) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!Array.isArray(postIds) || postIds.length === 0) return [];
      const ids = postIds.filter(Boolean).slice(0, 50);
      if (!ids.length) return [];
      const { data, error } = await client
        .from("community_post_media")
        .select("id,post_id,university_id,object_path,media_kind,mime_type,byte_size,alt_text,created_at")
        .in("post_id", ids)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;

      return Promise.all((data || []).map(async function(media) {
        const { data: signed, error: signedError } = await client
          .storage.from("campus-community-media")
          .createSignedUrl(media.object_path, 1800);
        return Object.assign({}, media, {
          signed_url: signedError ? null : (signed?.signedUrl || null)
        });
      }));
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

    async submitCampusHelpdeskTicket(input) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!input) throw new Error("Complete the campus request form.");
      const { data, error } = await client.rpc("submit_campus_helpdesk_ticket", {
        p_category: input.category,
        p_title: String(input.title || "").trim(),
        p_description: String(input.description || "").trim(),
        p_location: String(input.location || "").trim(),
        p_priority: input.priority || "normal"
      });
      if (error) throw error;
      return Array.isArray(data) ? (data[0] || null) : data;
    },

    async listCampusHelpdeskTickets() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.from("campus_helpdesk_tickets")
        .select("id,reference_code,university_id,created_by,created_by_username,category,title,description,location,priority,status,assigned_department,created_at,updated_at,closed_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },

    async listCampusHelpdeskTicketUpdates(ticketIds) {
      if (!client) throw new Error("Supabase is not configured.");
      const ids = Array.isArray(ticketIds) ? ticketIds.filter(Boolean).slice(0, 100) : [];
      if (!ids.length) return [];
      const { data, error } = await client.from("campus_helpdesk_ticket_updates")
        .select("id,ticket_id,author_id,author_label,message,from_status,to_status,department_to,created_at")
        .in("ticket_id", ids).order("created_at", { ascending: true }).limit(400);
      if (error) throw error;
      return data || [];
    },

    async updateCampusHelpdeskTicket(ticketId, status, department, message) {
      if (!client) throw new Error("Supabase is not configured.");
      const { error } = await client.rpc("update_campus_helpdesk_ticket", {
        p_ticket_id: ticketId,
        p_status: status || null,
        p_assigned_department: department === undefined ? null : department,
        p_message: String(message || "").trim() || null
      });
      if (error) throw error;
    },

    async listCampusNotices() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.from("campus_notices")
        .select("id,university_id,publisher_label,title,body,category,audience_scope,target_faculty,target_department,status,published_at,expires_at,created_at")
        .eq("status", "published").order("published_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },

    async publishCampusNotice(input) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!input) throw new Error("Complete the official notice form.");
      const { data, error } = await client.rpc("publish_campus_notice", {
        p_publisher_label: String(input.publisherLabel || "").trim(),
        p_title: String(input.title || "").trim(),
        p_body: String(input.body || "").trim(),
        p_category: input.category,
        p_audience_scope: input.audienceScope || "campus",
        p_target_faculty: input.targetFaculty || null,
        p_target_department: input.targetDepartment || null,
        p_expires_at: input.expiresAt || null
      });
      if (error) throw error;
      return data;
    },

    async archiveCampusNotice(noticeId) {
      if (!client) throw new Error("Supabase is not configured.");
      const { error } = await client.rpc("archive_campus_notice", { p_notice_id: noticeId });
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

    async listCampusEvents() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.from("campus_events")
        .select("id,university_id,title,description,category,starts_at,ends_at,location,status,organizer_username,created_at")
        .eq("status", "published").order("starts_at", { ascending: true }).limit(100);
      if (error) throw error;
      return data || [];
    },

    async createCampusEvent(input) {
      if (!client) throw new Error("Supabase is not configured.");
      const user = await this.getCurrentUser();
      const campus = await this.getMyCampusContext();
      if (!user || !campus?.university_id) throw new Error("Sign in and choose your university first.");
      const { data, error } = await client.from("campus_events").insert({
        university_id: campus.university_id, created_by: user.id, title: input.title,
        description: input.description || null, category: input.category,
        starts_at: input.startsAt, ends_at: input.endsAt || null,
        location: input.location || null, status: "pending"
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },

    async listMyCampusEventRsvps() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.from("campus_event_rsvps")
        .select("event_id,response").order("updated_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data || [];
    },

    async setCampusEventRsvp(eventId, response) {
      if (!client) throw new Error("Supabase is not configured.");
      const user = await this.getCurrentUser();
      if (!user) throw new Error("Sign in to RSVP.");
      const { error } = await client.from("campus_event_rsvps").upsert({
        event_id: eventId, user_id: user.id, response: response || "going",
        updated_at: new Date().toISOString()
      }, { onConflict: "event_id,user_id" });
      if (error) throw error;
    },

    async listCampusMarketplaceListings() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.from("campus_marketplace_listings")
        .select("id,university_id,category,title,description,price_ngn,contact_instructions,status,seller_username,created_at,updated_at")
        .in("status", ["published", "sold"]).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },

    async createCampusMarketplaceListing(input) {
      if (!client) throw new Error("Supabase is not configured.");
      const user = await this.getCurrentUser();
      const campus = await this.getMyCampusContext();
      if (!user || !campus?.university_id) throw new Error("Sign in and choose your university first.");
      const price = input.priceNgn === "" || input.priceNgn == null ? null : Number(input.priceNgn);
      if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error("Enter a valid price in naira.");
      const { data, error } = await client.from("campus_marketplace_listings").insert({
        university_id: campus.university_id, seller_id: user.id, category: input.category,
        title: input.title, description: input.description, price_ngn: price,
        contact_instructions: input.contactInstructions || null, status: "pending"
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },

    async markCampusListingSold(listingId) {
      if (!client) throw new Error("Supabase is not configured.");
      const { error } = await client.from("campus_marketplace_listings")
        .update({ status: "sold", updated_at: new Date().toISOString() }).eq("id", listingId);
      if (error) throw error;
    },

    async reportCampusListing(listingId, reason, details) {
      if (!client) throw new Error("Supabase is not configured.");
      const result = await client.rpc("report_campus_marketplace_listing", {
        p_listing_id: listingId,
        p_reason: reason,
        p_details: details || null
      });
      if (result.error) throw result.error;
      return result.data;
    },

    async listCampusContentModeration() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("list_campus_content_moderation");
      if (error) throw error;
      return data || { groups: [], events: [], listings: [], listing_reports: [] };
    },

    async reviewCampusContent(contentType, contentId, decision) {
      if (!client) throw new Error("Supabase is not configured.");
      const { error } = await client.rpc("review_campus_content", {
        p_content_type: contentType, p_content_id: contentId, p_decision: decision
      });
      if (error) throw error;
    },

    async reviewCampusListingReport(reportId, decision) {
      if (!client) throw new Error("Supabase is not configured.");
      const { error } = await client.rpc("review_campus_marketplace_report", {
        p_report_id: reportId, p_decision: decision
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
