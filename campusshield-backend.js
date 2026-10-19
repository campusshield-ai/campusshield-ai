
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

    async getMyStudentIdentityVerification() {
      if (!client) throw new Error("Supabase is not configured.");
      const user = await this.getCurrentUser();
      if (!user) throw new Error("Sign in before checking student identity.");
      const { data, error } = await client
        .from("student_identity_verifications")
        .select("user_id,university_id,institution_name,student_number,object_path,status,rejection_reason,created_at,reviewed_at,confirmed_fraud,fraud_decision_reason,fraud_decided_at,fraud_notice_at,fraud_lock_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async listStudentIdentityVerifications(userIds) {
      if (!client) throw new Error("Supabase is not configured.");
      const ids = Array.isArray(userIds) ? [...new Set(userIds.filter(Boolean))].slice(0, 200) : [];
      if (!ids.length) return [];
      const { data, error } = await client
        .from("student_identity_verifications")
        .select("user_id,university_id,institution_name,student_number,object_path,status,rejection_reason,created_at,reviewed_at,confirmed_fraud,fraud_decision_reason,fraud_decided_at,fraud_notice_at,fraud_lock_at")
        .in("user_id", ids);
      if (error) throw error;
      return data || [];
    },

    // RLS restricts this to the owner or a verified administrator of the same campus.
    // The UI uses this list only to offer an explicit, evidence-backed re-review action.
    async listApprovedStudentIdentityVerifications() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client
        .from("student_identity_verifications")
        .select("user_id,university_id,institution_name,student_number,object_path,status,rejection_reason,created_at,reviewed_at,confirmed_fraud,fraud_decision_reason,fraud_decided_at,fraud_notice_at,fraud_lock_at")
        .eq("status", "approved")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },

    async uploadStudentIdentityDocument(file, details) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!file) throw new Error("Choose a student ID image or PDF.");
      const maxBytes = 5 * 1024 * 1024;
      if (file.size < 1 || file.size > maxBytes) {
        throw new Error("Student ID files must be no larger than 5 MiB.");
      }
      const extension = String(file.name || "").split(".").pop().toLowerCase();
      const mimeByExtension = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        pdf: "application/pdf"
      };
      const expectedMime = mimeByExtension[extension];
      if (!expectedMime || (file.type && file.type !== expectedMime)) {
        throw new Error("Upload a JPEG, PNG, or PDF student ID document.");
      }
      const institutionName = String(details?.institutionName || "").trim();
      const studentNumber = String(details?.studentNumber || "").trim();
      if (institutionName.length < 2 || institutionName.length > 180) {
        throw new Error("Institution name must be 2–180 characters.");
      }
      if (studentNumber.length < 2 || studentNumber.length > 80) {
        throw new Error("Student or matric number must be 2–80 characters.");
      }

      const user = await this.getCurrentUser();
      if (!user) throw new Error("Sign in before submitting student identity.");
      const previous = await this.getMyStudentIdentityVerification();
      const fraudStatus = previous?.status === "approved"
        ? await this.getMyIdentityFraudLockStatus()
        : null;
      const confirmedFraudResubmission =
        previous?.status === "approved" && fraudStatus?.confirmed_fraud === true;
      if (previous?.status === "approved" && !confirmedFraudResubmission) {
        throw new Error("Your student identity is already approved.");
      }
      if (previous?.status === "pending") {
        throw new Error("Your current identity submission is awaiting review.");
      }

      const safeFilename = crypto.randomUUID() + "." + extension;
      const objectPath = user.id + "/" + safeFilename;
      const bucket = client.storage.from("student-identity-documents");
      const { error: uploadError } = await bucket.upload(objectPath, file, {
        contentType: expectedMime,
        cacheControl: "3600",
        upsert: false
      });
      if (uploadError) throw uploadError;

      try {
        const { error: submitError } = await client.rpc("submit_student_identity_verification", {
          p_institution_name: institutionName,
          p_student_number: studentNumber,
          p_object_path: objectPath
        });
        if (submitError) throw submitError;
      } catch (error) {
        const { error: cleanupError } = await bucket.remove([objectPath]);
        if (cleanupError) console.warn("Could not remove an unsubmitted identity upload:", cleanupError.message);
        throw error;
      }

      if (previous?.object_path && previous.object_path !== objectPath) {
        const { error: cleanupError } = await bucket.remove([previous.object_path]);
        if (cleanupError) console.warn("The replaced rejected document could not be removed:", cleanupError.message);
      }
      return this.getMyStudentIdentityVerification();
    },

    async createStudentIdentityDocumentUrl(objectPath) {
      if (!client) throw new Error("Supabase is not configured.");
      const safePath = String(objectPath || "");
      if (!/^[0-9a-fA-F-]{36}\/(?:[0-9a-fA-F-]{36}\.(jpg|jpeg|png|pdf)|student-identity-document)$/.test(safePath)) {
        throw new Error("The student document path is invalid.");
      }
      const { data, error } = await client.storage
        .from("student-identity-documents")
        .createSignedUrl(safePath, 90);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error("A temporary document link could not be created.");
      return data.signedUrl;
    },

    async reviewStudentIdentityVerification(userId, decision, rejectionReason) {
      if (!client) throw new Error("Supabase is not configured.");
      if (!["approve", "reject", "fraud"].includes(decision)) {
        throw new Error("Choose approve, reject, or confirm fraud.");
      }
      if (["reject", "fraud"].includes(decision) &&
          String(rejectionReason || "").trim().length < 5) {
        throw new Error("Provide a reason of at least 5 characters.");
      }
      const { error } = await client.rpc("review_student_identity_verification", {
        p_user_id: userId,
        p_decision: decision,
        p_rejection_reason: rejectionReason || null
      });
      if (error) throw error;
    },

    async getMyIdentityFraudLockStatus() {
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client.rpc("my_identity_fraud_lock_status");
      if (error) throw error;
      return data || { confirmed_fraud: false, locked: false };
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


    async askShieldMind(question, history = []) {
      if (!client) throw new Error("Supabase is not configured.");
      const cleanQuestion = String(question || "").trim();
      if (!cleanQuestion || cleanQuestion.length > 1200) throw new Error("Enter a question up to 1,200 characters.");
      const safeHistory = Array.isArray(history) ? history.slice(-6).filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string" && item.content.length <= 1200).map(item => ({role:item.role,content:item.content})) : [];
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error("Sign in to use ShieldMind.");
      const { data, error } = await client.functions.invoke("shieldmind-chat", { body: { question: cleanQuestion, history: safeHistory } });
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
