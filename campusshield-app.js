(() => {
  const $ = id => document.getElementById(id);
  let deferredInstallPrompt = null;
  const installCard = $('install-card');
  const installButton = $('install-app');
  const workspaceInstallButton = $('workspace-install-app');
  const installGuidance = $('install-guidance');
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  if (!isInstalled && isIOS) {
    installGuidance.textContent = 'On iPhone or iPad, open this page in Safari, tap Share, then choose “Add to Home Screen”.';
    installCard.hidden = false;
    workspaceInstallButton.textContent = 'Install app';
    workspaceInstallButton.hidden = false;
  } else if (!isInstalled && /android/i.test(navigator.userAgent)) {
    installGuidance.textContent = 'Open your browser’s menu (⋮), then choose “Install app” or “Add to Home screen”.';
    installCard.hidden = false;
    workspaceInstallButton.textContent = 'Install app';
    workspaceInstallButton.hidden = false;
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installGuidance.textContent = 'Install CampusShield on this device for quick, full-screen access.';
    installCard.hidden = false;
    installButton.hidden = false;
    workspaceInstallButton.textContent = 'Install app';
    workspaceInstallButton.hidden = false;
  });

  async function promptInstall() {
    if (!deferredInstallPrompt) return;
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    installButton.disabled = true;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        installCard.hidden = true;
      } else {
        installButton.hidden = true;
        installGuidance.textContent = 'You can install later from your browser’s menu.';
      }
    } catch {
      installButton.hidden = true;
      installGuidance.textContent = 'Open your browser’s menu and choose “Install app” or “Add to Home screen”.';
      workspaceInstallButton.textContent = 'Install app';
    } finally {
      installButton.disabled = false;
    }
  }

  installButton.addEventListener('click', promptInstall);
  workspaceInstallButton.addEventListener('click', () => {
    if (deferredInstallPrompt) promptInstall();
    else toast(installGuidance.textContent || 'Use your browser’s menu to add CampusShield to your home screen.');
  });

  window.addEventListener('appinstalled', () => {
    installCard.hidden = true;
    workspaceInstallButton.hidden = true;
    deferredInstallPrompt = null;
  });

  let incidents = [];
  let incidentRefreshInProgress = false;
  let incidentRefreshQueued = false;
  let authSessionVersion = 0;
  let incidentsLastUpdated = null;
  let authMode = 'signin';
  let identityCompletionMode = false;
  let authBusy = false;
  let confirmationPending = false;
  const initialRecoveryHash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  let passwordRecoveryActive =
    new URLSearchParams(window.location.search).get('password-reset') === '1' ||
    initialRecoveryHash.get('type') === 'recovery';

  function normalizeSeverity(value) {
    const key = String(value ?? '').trim().toLowerCase();
    const known = {high:'High', medium:'Medium', low:'Low'};
    return known[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Unspecified');
  }

  function normalizeStatus(value) {
    const key = String(value ?? '').trim().replace(/[_-]+/g, ' ').toLowerCase();
    const known = {open:'Open', resolved:'Resolved', 'in progress':'In progress', 'under review':'Under review'};
    return known[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Open');
  }

  function isResolvedStatus(value) {
    return normalizeStatus(value).toLowerCase() === 'resolved';
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[ch]));

  const dateText = value => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleString();
  };

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3500);
  }

  function tagSeverity(s) {
    const label = normalizeSeverity(s);
    const token = ['High', 'Medium', 'Low'].includes(label) ? label.toLowerCase() : 'unknown';
    return `<span class="tag ${token}">${esc(label)}</span>`;
  }

  function tagStatus(s) {
    const label = normalizeStatus(s);
    return `<span class="tag ${isResolvedStatus(label) ? 'resolved' : 'open'}">${esc(label)}</span>`;
  }

  let currentProfile = null;
  let communityProfile = null;
  let campusContext = null;

  // Push notification destinations are an allowlist, not arbitrary page names.
  const notificationDestinationPages = new Set(['timetable', 'campus-messages', 'noticeboard', 'profile-settings']);
  let pendingNotificationPage = new URLSearchParams(window.location.search).get('page');
  if (!notificationDestinationPages.has(pendingNotificationPage)) pendingNotificationPage = null;

  function clearPendingNotificationPage() {
    pendingNotificationPage = null;
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('page')) return;
      url.searchParams.delete('page');
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } catch (_) {
      // Navigation can continue if history APIs are unavailable.
    }
  }

  // Once a signed-in user interacts with the workspace, discard the notification
  // deep link so a later refresh does not keep forcing the previous destination.
  document.addEventListener('click', function(event) {
    if (!event.isTrusted || !event.target?.closest?.('#workspace')) return;
    clearPendingNotificationPage();
  }, true);
  let campusUniversitiesCache = null;
  let communityLoading = false;
  let studentIdentitySubmission = null;
  let currentStaffPosition = '';

  function hasApprovedStudentIdentity() {
    return isStudentAccount() &&
      currentProfile?.verification_status === 'verified' &&
      studentIdentitySubmission?.status === 'approved';
  }

  function isStudentIdentityLocked() {
    // Database and API policies enforce identity approval for protected operations.
    // Do not redirect a signed-in student away from the standard workspace.
    return false;
  }

  function syncNavSectionHeadings() {
    const anyVisible = ids => ids.some(id => { const element = $(id); return Boolean(element && !element.hidden); });
    const staffHeading = $('nav-staff-heading');
    const adminHeading = $('nav-admin-heading');
    if (staffHeading) staffHeading.hidden = !anyVisible(['classroom-nav','manage-nav','risk-nav','analytics-nav','staff-verification-nav','staff-review-nav']);
    if (adminHeading) adminHeading.hidden = !anyVisible(['approvals-nav','platform-admin-nav']);
  }

  function syncIdentityNavigation() {
    const student = isStudentAccount();
    const teacher = isTeacherAccount();
    const verified = currentProfile?.verification_status === 'verified';
    const shieldMindAccessNotice = $('shieldmind-access-notice');
    if (shieldMindAccessNotice) {
      const campusReady = verified && !!campusContext?.university_id &&
        campusContext.membership_status === 'active' &&
        campusContext.verification_status === 'verified';
      shieldMindAccessNotice.hidden = campusReady;
      shieldMindAccessNotice.textContent = !verified
        ? 'ShieldMind is open for general academic questions. Account verification is still required for protected campus features.'
        : !campusContext?.university_id
          ? 'ShieldMind is open for general academic questions. Join your university space to unlock campus-aware answers and protected campus features.'
          : 'General academic questions are available. Campus-aware answers and protected actions remain gated until your university membership is verified.';
    }
    const setup = $('student-identity-setup-button');
    const note = $('student-identity-setup-status');
    const state = studentIdentitySubmission?.status || null;
    document.querySelectorAll('.nav button[data-page]').forEach(button => {
      if (button.id === 'platform-admin-nav') return;
      if (button.dataset.page === 'shieldmind' || button.dataset.page === 'billing') {
        // General AI and subscription information is discoverable to all signed-in users.
        // Sensitive operations and payment activation are still enforced server-side.
        button.hidden = false;
        return;
      }
      if (button.dataset.page === 'student-rewards') {
        button.hidden = !student;
        return;
      }
      if (button.dataset.page === 'classroom') {
        button.hidden = !(verified && hasVerifiedCampusStaffMembership() && ['teacher','security','admin'].includes(currentProfile?.role));
        return;
      }
      if (button.dataset.page === 'opportunities') {
        button.hidden = !(verified && hasVerifiedCampusStaffMembership());
        return;
      }
      if (button.id === 'approvals-nav') {
        button.hidden = !(verified && currentProfile?.role === 'admin' && hasVerifiedCampusStaffMembership());
        return;
      }
      if (button.id === 'staff-verification-nav') { button.hidden = currentProfile?.role !== 'teacher'; return; }
      if (button.id === 'staff-review-nav') {
        button.hidden = !(verified && currentProfile?.role === 'admin' && hasVerifiedCampusStaffMembership());
        return;
      }
      if (['manage','risk','analytics'].includes(button.dataset.page)) { button.hidden = !canManageIncidents(); return; }
      if (student && !verified) button.hidden = false;
    });
    const mobileRewardsNav = document.querySelector('.mobile-bottom-nav [data-page="student-rewards"]');
    if (mobileRewardsNav) mobileRewardsNav.hidden = !student;
    if (setup && note) {
      setup.hidden = !student || state === 'approved' || state === 'pending';
      note.hidden = !student;
      note.textContent = state === 'approved' ? 'Student identity approved.'
        : state === 'pending' ? 'Your student ID is awaiting review. Account permissions remain server-controlled.'
        : state === 'rejected' ? 'Your student ID was rejected. Open Complete student setup to correct it and resubmit.'
        : student ? 'Complete student setup to submit your student ID privately for review.' : '';
    }
    renderRoleAccessSummary();
    syncNavSectionHeadings();
  }

  function hasVerifiedCampusStaffMembership() {
    return currentProfile?.verification_status === 'verified' &&
      campusContext?.membership_status === 'active' &&
      campusContext?.verification_status === 'verified';
  }

  function canManageIncidents() {
    return hasVerifiedCampusStaffMembership() &&
      ['security', 'admin'].includes(currentProfile.role);
  }

  function canManageInstitutionalBilling() {
    return currentProfile?.role === 'admin' && currentProfile?.verification_status === 'verified';
  }

  function syncCampusAccessNavigation() {
    const verified = currentProfile?.verification_status === 'verified';
    const staffCampusApproved = hasVerifiedCampusStaffMembership();
    $('approvals-nav').hidden = !(verified && currentProfile?.role === 'admin' && staffCampusApproved);
    $('staff-verification-nav').hidden = !isTeacherAccount();
    $('staff-review-nav').hidden = !(verified && currentProfile?.role === 'admin' && staffCampusApproved);
    syncNavSectionHeadings();
  }

  // Billing UI is visible to all signed-in accounts. Checkout is only opened by a
  // server-created Paystack transaction; client-side clicks never grant paid access.
  const institutionBillingForm = $('institutional-billing-form');
  if (institutionBillingForm) {
    $('institution-billing-cancel')?.addEventListener('click', () => {
      institutionBillingForm.hidden = true;
      $('institution-billing-status').textContent = '';
    });
    institutionBillingForm.addEventListener('submit', async event => {
      event.preventDefault();
      const status = $('institution-billing-status');
      const backend = window.CampusShieldBackend;
      const submit = $('institution-billing-submit');
      if (!canManageInstitutionalBilling()) {
        institutionBillingForm.hidden = true;
        toast('Only verified administrators can submit institutional billing requests.');
        return;
      }
      if (!currentProfile || !backend?.isConfigured) {
        status.textContent = 'Please sign in before submitting an institutional request.';
        return;
      }
      const institutionName = String($('institution-billing-name')?.value || '').trim();
      const plan = String($('institution-billing-plan')?.value || '');
      const period = String($('institution-billing-period')?.value || 'monthly');
      const contactEmail = String($('institution-billing-email')?.value || '').trim();
      const message = String($('institution-billing-message')?.value || '').trim();
      if (!institutionName || !contactEmail || !['monthly','yearly'].includes(period)) {
        status.textContent = 'Complete the required fields before submitting.';
        return;
      }
      submit.disabled = true;
      status.textContent = 'Submitting your request securely…';
      try {
        const { data: { user }, error: userError } = await backend.client.auth.getUser();
        if (userError || !user) throw new Error('Your session could not be verified. Please sign in again.');
        const { error } = await backend.client.from('campus_institutional_billing_requests').insert({
          requester_id: user.id,
          institution_name: institutionName,
          requested_plan: plan,
          billing_period: period,
          contact_email: contactEmail,
          message: message || null
        });
        if (error) throw error;
        status.textContent = 'Request submitted. It is pending review; no payment was taken and no campus subscription has been activated.';
        institutionBillingForm.reset();
        await loadInstitutionalBillingRequests();
      } catch (error) {
        status.textContent = error?.message || 'The request could not be submitted. Please try again.';
      } finally {
        submit.disabled = false;
      }
    });
  }
  async function loadInstitutionalBillingRequests() {
    const container = $('institutional-billing-requests');
    if (!container) return;
    if (!canManageInstitutionalBilling()) {
      container.replaceChildren();
      return;
    }
    const backend = window.CampusShieldBackend;
    if (!currentProfile || !backend?.isConfigured) {
      container.textContent = 'Sign in to view your institutional billing requests.';
      return;
    }
    try {
      const { data: { user }, error: userError } = await backend.client.auth.getUser();
      if (userError || !user) throw new Error('Session could not be verified.');
      const { data, error } = await backend.client.from('campus_institutional_billing_requests')
        .select('institution_name,requested_plan,billing_period,status,created_at')
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      container.replaceChildren();
      if (!data?.length) {
        container.textContent = 'No institutional billing requests submitted yet.';
        return;
      }
      data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'community-post';
        const title = document.createElement('strong');
        title.textContent = item.institution_name + ' · ' + item.requested_plan.replace(/-/g, ' ');
        const detail = document.createElement('p');
        detail.textContent = item.billing_period + ' · ' + item.status + ' · ' + new Date(item.created_at).toLocaleDateString();
        card.append(title, detail);
        container.appendChild(card);
      });
    } catch (_error) {
      container.textContent = 'Requests could not be loaded right now.';
    }
  }
  $('profile-settings-signout')?.addEventListener('click', () => $('signout-button')?.click());

  document.querySelectorAll('[data-billing-plan]').forEach(button => {
    button.addEventListener('click', async () => {
      const status = $('billing-payment-message');
      const plan = button.dataset.billingPlan;
      const kind = button.dataset.billingKind;
      if (kind === 'institution' && !canManageInstitutionalBilling()) {
        toast('Only verified administrators can access institutional billing.');
        return;
      }
      if (!window.CampusShieldBackend?.client) {
        status.textContent = 'Billing is unavailable because the secure backend is not configured.';
        return;
      }
      if (kind === 'institution') {
        const form = $('institutional-billing-form');
        if (form) {
          form.hidden = false;
          const planField = $('institution-billing-plan');
          if (planField) planField.value = plan;
          const periodField = $('institution-billing-period');
          if (periodField) periodField.value = 'monthly';
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
          $('institution-billing-name')?.focus();
          status.textContent = 'Complete the institutional billing request form. No payment will be taken at this stage.';
        }
        return;
      }
      button.disabled = true;
      const stagingBilling = isStagingSupabaseEnvironment();
      button.disabled = true;
      status.textContent = stagingBilling
        ? 'Preparing secure Paystack test checkout…'
        : 'Preparing secure live Paystack checkout…';
      try {
        const functionName = stagingBilling ? 'shieldmind-billing-checkout' : 'paystack-initialize';
        const requestBody = stagingBilling ? { plan } : { plan, billing_period: 'monthly' };
        const { data, error } = await window.CampusShieldBackend.client.functions.invoke(functionName, {
          body: requestBody
        });
        if (error) {
          let providerMessage = null;
          try { providerMessage = (await error.context?.clone?.().json())?.error || null; } catch (_ignored) {}
          throw new Error(providerMessage || (stagingBilling
            ? 'Paystack test checkout is not available. Check staging billing configuration. No payment has been taken.'
            : 'Secure live checkout is not available. Check production Paystack setup. No payment has been taken.'));
        }
        if (!data?.authorization_url || typeof data.authorization_url !== 'string' ||
            !/^https:\/\/checkout\.paystack\.com\//i.test(data.authorization_url)) {
          throw new Error(data?.error || 'Secure checkout is not configured yet. No payment has been taken.');
        }
        window.location.assign(data.authorization_url);
      } catch (error) {
        status.textContent = error?.message || 'Secure checkout is not available yet. No payment has been taken.';
      } finally {
        button.disabled = false;
      }
    });
  });

  // Database-assigned elevated roles are authoritative; requested metadata is for onboarding only.
  function getWorkspaceAccountType(profile = currentProfile) {
    const actualRole = String(profile?.role || '').trim().toLowerCase();
    if (['admin','security','teacher'].includes(actualRole)) return actualRole;
    return String(profile?.requested_role || '').trim().toLowerCase() === 'teacher' ? 'teacher' : 'student';
  }
  function isStudentAccount() { return getWorkspaceAccountType() === 'student'; }
  function isTeacherAccount() { return getWorkspaceAccountType() === 'teacher'; }

  function setRoleAccessList(items) {
    const list = $('role-access-list');
    if (list) list.replaceChildren(...items.map(text => { const li=document.createElement('li'); li.textContent=text; return li; }));
  }
  function renderRoleAccessSummary(metadata = {}) {
    const panel=$('role-access-summary');
    if(!panel || !currentProfile){if(panel)panel.hidden=true;return;}
    panel.hidden=false;
    const role=String(currentProfile.role||'').toLowerCase();
    const requested=String(currentProfile.requested_role||metadata.requested_role||'').toLowerCase();
    const verified=currentProfile.verification_status==='verified';
    const campusOk=hasVerifiedCampusStaffMembership();
    const position=String(currentStaffPosition||metadata.campus_position||currentProfile.campus_position||'').trim();
    const positionLine=$('role-access-position');
    if(positionLine){positionLine.hidden=!position;positionLine.textContent=position?'Position on record: '+position+'. This is a verification detail, not a permissions grant.':'';}
    let state='restricted',badge='Limited access',title='Your access and permissions',description='Access depends on the approved system role and verified campus membership.',items=[],limit='A selected title or requested role cannot unlock protected actions. Supabase authorization and the approved account role determine access.';
    if(!verified){
      state='pending';badge='Verification pending';
      if(requested==='teacher'){
        title='Staff application workspace';
        description='Your account is not yet approved for protected staff functions. Complete staff identity verification and wait for an authorized campus administrator to review it.';
        items=['Submit your staff ID, official university email, staff number, or employment evidence through your own staff-verification page.','Use basic account and onboarding screens while the application is pending.','After approval, use the standard staff workspace tools available to verified staff.'];
        limit='A Vice-Chancellor, Registrar, Dean, Professor, Lecturer, Bursar, Administrative Staff, or Security Staff title does not itself grant administrator or security-console access.';
      } else {
        title='Finish account verification';description='Complete your account and student identity steps before relying on protected campus features.';
        items=['Complete your account and campus identity setup.','Use general academic assistance and basic onboarding screens available to your account.','After approval, use student features enabled for your verified campus membership.'];
        limit='Protected reports and verified campus services may remain unavailable while verification is pending. CampusShield does not contact emergency services.';
      }
    } else if(role==='admin' && campusOk){
      state='approved';badge='Verified campus administrator';title='Campus administrator workspace';description='You have administrator access for your approved campus, subject to database authorization.';
      items=['Review campus staff and account-verification applications available to your role.','Use incident management, risk analysis and analytics for your authorized campus.','Use campus administrative controls and institutional billing only where server-side policies permit.'];
      limit='Platform-wide administration and trusted platform-admin assignments require separate platform-level provisioning. Your campus role does not grant access to another university.';
    } else if(role==='security' && campusOk){
      state='approved';badge='Verified campus security';title='Campus safety operations';description='Your approved security role unlocks safety operations for your verified campus.';
      items=['Review and manage incident reports available to your security role.','Use risk analysis and incident analytics for your authorized campus.','Resolve or update incidents only through actions permitted by your role and database policies.'];
      limit='Security access does not grant staff-application approvals, institutional billing administration, campus administrator powers, or platform-wide controls.';
    } else if(role==='teacher' && campusOk){
      state='approved';badge='Verified university staff';title='University staff workspace';description='Your verified staff workspace is based on the teacher/staff system role, not your job title.';
      items=['Create and manage classroom spaces where enabled for verified teachers.','Use campus opportunities, community and student-support features available to verified staff.','Publish official campus notices where the feature and campus policies allow it.'];
      limit='The standard staff role cannot manage/resolve incident reports, access staff-review queues, administer institutional billing, or grant campus/platform administrator access. Security-console access requires a separate security-role assignment.';
    } else if(['teacher','security','admin'].includes(role) && !campusOk){
      state='restricted';badge='Campus membership not verified';title='Campus access is not fully enabled';description='Your account exists, but the campus membership required for these tools is not currently verified.';
      items=['Check your account and identity-verification status.','Contact the authorized administrator for your campus if the membership status is incorrect.','Only use actions currently shown and permitted for your account.'];
      limit='Incident management, staff review and other campus-scoped privileged actions remain gated until the required membership is approved.';
    } else {
      state=verified&&campusOk?'approved':'restricted';badge=verified&&campusOk?'Verified student':'Campus access limited';title='Student campus workspace';description='Use CampusShield for your own campus safety and student-life activity.';
      items=['Submit and follow up on your own safety reports when the database says your account is eligible.','Use community, groups, events, helpdesk and opportunities available to verified campus members.','Manage your own profile and private account information.'];
      limit='Students cannot review other users’ private reports, resolve incidents, access staff-only risk analytics, approve staff accounts, or administer campus settings.';
    }
    $('role-access-status').textContent=badge;$('role-access-status').dataset.state=state;
    $('role-access-title').textContent=title;$('role-access-description').textContent=description;setRoleAccessList(items);$('role-access-limit').textContent=limit;
  }
  async function loadRoleAccessSummaryContext() {
    const profileId=currentProfile?.id, backend=window.CampusShieldBackend;
    if(!backend?.isConfigured){renderRoleAccessSummary();return;}
    try{
      const user=await backend.getCurrentUser();
      if(!currentProfile||(profileId&&currentProfile.id!==profileId))return;
      const metadata=user?.user_metadata||{};currentStaffPosition=String(metadata.campus_position||'').trim();
      if(!currentStaffPosition && ['teacher','security'].includes(String(currentProfile.role||'').toLowerCase())){
        const row=await backend.getMyCampusStaffVerification().catch(()=>null);
        if(!currentProfile||(profileId&&currentProfile.id!==profileId))return;
        currentStaffPosition=String(row?.position_title||'').trim();
      }
      renderRoleAccessSummary(metadata);
    }catch(_){renderRoleAccessSummary();}
  }
  function updateStaffPositionAccessPreview() {
    const preview=$('staff-position-access-preview'), role=$('auth-role'), position=String($('auth-staff-position')?.value||'').trim();
    if(!preview||!role)return;
    preview.hidden=authMode!=='signup'||role.value!=='teacher';if(preview.hidden)return;
    const security=position.toLowerCase()==='security staff';
    const leadership=['vice-chancellor','deputy vice-chancellor','registrar','bursar','university librarian','dean','head of department'].includes(position.toLowerCase());
    $('staff-position-access-title').textContent=position?position+': access after approval':'What your staff position means';
    $('staff-position-access-description').textContent=position?'Your selected position is saved for verification. After staff identity and campus membership are approved, the standard staff workspace is enabled.':'Choose your university appointment. Every listed position follows the same staff-verification and least-privilege process.';
    const items=['Use classroom tools, campus opportunities, student-support features and official notices where enabled for verified staff.','Submit and track your own staff identity-verification application.','See only pages and actions allowed by your approved system role and verified campus membership.'];
    $('staff-position-access-list').replaceChildren(...items.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    $('staff-position-access-limit').textContent=security
      ? 'Security staff: this title alone does not unlock incident management, report resolution or risk analytics. A trusted administrator must separately provision the security system role.'
      : leadership
        ? 'Leadership/administration: this title and the campus-admin request checkbox do not grant campus administrator powers. A separate authorized appointment is required.'
        : 'A job title never grants incident-management, risk-analysis, staff-approval, institutional-billing or administrator permissions. Those require separate system-role authorization.';
  }

  function showWorkspace(profile) {
    if (!profile) {
      currentProfile = null;
      showLogin('Your account profile could not be loaded. Please sign in again or contact support.');
      return false;
    }

    if (profile.verification_status === 'rejected') {
      currentProfile = null;
      showLogin('Your account verification was rejected. Please contact a CampusShield administrator.');
      return false;
    }

    currentProfile = profile;
    currentStaffPosition = '';
    studentIdentitySubmission = null;
    renderRoleAccessSummary();
    void loadRoleAccessSummaryContext();
    // Hydrate the saved identity immediately so both the profile card and dashboard
    // greeting reflect this signed-in user's own name and private avatar.
    syncDashboardProfileIdentity().catch(() => {});
    $('login-screen').hidden = true;
    $('workspace').hidden = false;
    maybeShowCampusWelcomeTour();

    const verified = currentProfile.verification_status === 'verified';
    if ($('quick-campus-alerts')) $('quick-campus-alerts').hidden = !verified;
    if ($('campus-alerts-link')) $('campus-alerts-link').hidden = !verified;
    if ($('campus-alerts-gate')) $('campus-alerts-gate').hidden = verified;
    const institutionalBillingPanel = $('institutional-billing-panel');
    if (institutionalBillingPanel) institutionalBillingPanel.hidden = !canManageInstitutionalBilling();
    document.querySelectorAll('[data-page="noticeboard"], [data-page="helpdesk"], [data-page="community"], [data-page="groups"], [data-page="events"], [data-page="marketplace"]').forEach(el => {
      el.hidden = !verified;
    });
    const canManageIncidents = verified && ['security', 'admin'].includes(currentProfile.role);
    document.querySelectorAll('[data-page="manage"], [data-page="risk"], [data-page="analytics"]').forEach(el => {
      el.hidden = !canManageIncidents;
    });
    $('staff-verification-nav').hidden = !isTeacherAccount();
    $('staff-review-nav').hidden = !(verified && currentProfile.role === 'admin' && hasVerifiedCampusStaffMembership());
    const dashboardTitle = $('page-dashboard h1');
    const dashboardIntro = $('page-dashboard .heading p');
    if (dashboardTitle && dashboardIntro) {
      if (currentProfile.role === 'admin') {
        dashboardTitle.textContent = 'Your university, governed securely.';
        dashboardIntro.textContent = 'Review staff access and manage your own university platform. Platform-wide controls remain restricted to trusted CampusShield administrators.';
      } else if (isTeacherAccount()) {
        dashboardTitle.textContent = 'Your university staff workspace.';
        dashboardIntro.textContent = 'Support students, publish approved campus notices, and help your university run smoothly. Administrator powers require a separate appointment.';
      } else {
        dashboardTitle.textContent = 'Your campus, in one place.';
        dashboardIntro.textContent = 'Stay safe, find your people, and make the most of campus life. Your campus space is limited to your university.';
      }
    }
    $('approvals-nav').hidden = !(currentProfile.role === 'admin' && verified);
    const canPublishOfficial = verified && ['admin', 'security', 'teacher'].includes(currentProfile.role);
    $('community-announcement-option').disabled = !canPublishOfficial;
    syncIdentityNavigation();
    const returnedFromPayment = new URLSearchParams(window.location.search).get('billing') === 'return';
    navigate(returnedFromPayment ? 'billing' : 'dashboard');
    $('billing-reconcile-button').onclick = reconcileReturnedPaystackPayment;
    if (returnedFromPayment) {
      const returnParams = new URLSearchParams(window.location.search);
      const returnedReference = returnParams.get('reference') || returnParams.get('trxref');
      $('billing-reconcile-button').hidden = !returnedReference;
      if (returnedReference) {
        $('billing-payment-message').textContent = 'Checking your payment directly with Paystack. A redirect by itself never activates a subscription.';
        void reconcileReturnedPaystackPayment();
      } else {
        $('billing-payment-message').textContent = 'Paystack returned without a transaction reference. Refresh plan status before trying another payment; do not pay twice.';
      }
      refreshShieldMindPlan();
      loadInstitutionalBillingRequests();
    }
    refreshPlatformAdminAccess();
    return true;
  }

  function showLogin(message) {
    $('workspace').hidden = true;
    $('login-screen').hidden = false;
    setAuthMode('signin');
    if (message) $('auth-message').textContent = message;
  }

  function isStagingSupabaseEnvironment() {
    try {
      const config = window.CAMPUSSHIELD_SUPABASE_CONFIG || {};
      return new URL(String(config.url || "")).hostname === "hywcpnoqqhxvujnimhxl.supabase.co";
    } catch (_error) {
      return false;
    }
  }

  async function isGoogleProviderEnabled() {
    const config = window.CAMPUSSHIELD_SUPABASE_CONFIG || {};
    const publishableKey = String(config.publishableKey || "");
    if (!isStagingSupabaseEnvironment() || !publishableKey) return false;
    const response = await fetch(String(config.url).replace(/\/$/, "") + "/auth/v1/settings", {
      method: "GET",
      headers: { apikey: publishableKey, Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Could not verify the Google sign-in provider status.");
    const settings = await response.json();
    return settings?.external?.google === true;
  }

  function isStrongPasswordBaseline(value) {
    const password = String(value || '');
    return password.length >= 12 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password);
  }

  function setAuthMode(mode) {
    authMode = mode === 'signup' ? 'signup' : mode === 'reset' ? 'reset' : 'signin';
    const isSignUp = authMode === 'signup';
    const isReset = authMode === 'reset';

    $('auth-tabs').hidden = isReset;
    $('google-signin-wrap').hidden = isSignUp || isReset || !isStagingSupabaseEnvironment();
    $('signin-institution-field').hidden = isSignUp || isReset;
    $('signin-role-picker').hidden = isSignUp || isReset;
    $('signin-role-note').hidden = isSignUp || isReset;
    $('signup-fields').hidden = !isSignUp;
    $('signup-profile-fields').hidden = !isSignUp || identityCompletionMode;
    $('signup-student-identity-panel').hidden = !isSignUp || ($('auth-role').value === 'teacher' && !identityCompletionMode);
    $('identity-submit').hidden = !identityCompletionMode;
    $('auth-tabs').hidden = isReset || identityCompletionMode;
    $('auth-email-field').hidden = isReset || identityCompletionMode;
    $('auth-email').required = !isReset && !identityCompletionMode;
    $('auth-password-field').hidden = isReset || identityCompletionMode;
    $('auth-password').required = !isReset && !identityCompletionMode;
    $('password-reset-fields').hidden = !isReset;
    $('new-password').required = isReset;
    $('confirm-new-password').required = isReset;
    $('forgot-password-field').hidden = isSignUp || isReset || identityCompletionMode;
    $('remember-email-field').hidden = isSignUp || isReset || identityCompletionMode;
    // Required controls in hidden signup panels must never block normal sign-in.
    if (!isSignUp || identityCompletionMode) {
      ['auth-name','auth-username','auth-role','auth-university-search','auth-faculty','auth-department','auth-course','auth-year-of-study','auth-staff-position','auth-staff-number','identity-student-number','identity-document','identity-institution-search','identity-original-document-confirmation'].forEach(function(id) {
        const field = $(id);
        if (field) field.required = false;
      });
    }
    // University listing is a separate, optional request. Its collapsed fields
    // must not prevent account creation or student setup from submitting.
    ['identity-request-university-name','identity-request-university-state','identity-request-university-ownership'].forEach(function(id) {
      const field = $(id);
      if (field) field.required = false;
    });
    $('auth-role').required = isSignUp && !identityCompletionMode;
    $('auth-username').required = isSignUp && !identityCompletionMode;
    $('auth-name').required = isSignUp && !identityCompletionMode;
    $('auth-university').required = false; // hidden ID select is populated only after an exact directory match
    if ($('auth-university-search')) $('auth-university-search').required = isSignUp && !identityCompletionMode;
    syncSignupRoleFields(isSignUp && !identityCompletionMode);
    $('resend-field').hidden = isReset || (isSignUp && !confirmationPending);
    $('auth-helper').hidden = isReset;
    $('install-card').hidden = isReset;
    $('auth-title').textContent = identityCompletionMode ? 'Complete student setup' : isSignUp ? 'Create your account' : isReset ? 'Choose a new password' : 'Welcome back';
    $('auth-subtitle').textContent = identityCompletionMode ? 'Submit your student ID document using the university linked to your account.' : isSignUp
      ? 'Set up a CampusShield account to submit reports.'
      : isReset
        ? 'Set a new password to finish recovering your account.'
        : "Sign in to your university's CampusShield workspace.";
    $('auth-password').autocomplete = isSignUp ? 'new-password' : 'current-password';
    $('auth-password').minLength = isSignUp ? 12 : 1;
    $('auth-password').placeholder = isSignUp ? '12+ characters with mixed case, number & symbol' : 'Enter your password';
    $('auth-submit').hidden = identityCompletionMode;
    $('auth-submit').textContent = identityCompletionMode ? 'Submit student ID for review' : isSignUp ? 'Create account' : isReset ? 'Update password' : 'Sign in';
    $('auth-helper').hidden = identityCompletionMode || isReset;
    $('auth-helper').textContent = isSignUp
      ? 'Choose your university and complete your student or staff details now. Student ID files upload privately after authentication. If email confirmation is required, sign in and choose Complete student setup.'
      : 'CampusShield AI does not automatically contact emergency services.';
    document.querySelectorAll('[data-auth-mode]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.authMode === authMode))
    );
    $('auth-message').textContent = isSignUp
      ? 'Create an account to get started.'
      : isReset
        ? 'Enter and confirm your new password.'
        : 'Please sign in or create an account.';
  }

  function syncSignupRoleFields(enabled = authMode === 'signup') {
    const isTeacher = $('auth-role').value === 'teacher';
    $('signup-student-fields').hidden = !enabled || isTeacher;
    $('signup-staff-fields').hidden = !enabled || !isTeacher;
    ['auth-faculty','auth-department','auth-course','auth-year-of-study'].forEach(id => { $(id).required = Boolean(enabled && !isTeacher); });
    $('auth-staff-position').required = Boolean(enabled && isTeacher);
    $('identity-student-number').required = Boolean((enabled && !isTeacher) || identityCompletionMode);
    $('identity-document').required = Boolean((enabled && !isTeacher) || identityCompletionMode);
    $('identity-institution-search').required = Boolean((enabled && !isTeacher) || identityCompletionMode);
    $('identity-original-document-confirmation').required = Boolean((enabled && !isTeacher) || identityCompletionMode);
    // Refresh role-specific verification guidance in the currently selected language.
    window.CampusShieldI18n?.apply();
    updateStaffPositionAccessPreview();
  }

  $('auth-role').addEventListener('change', () => {
    syncSignupRoleFields();
    updateStaffPositionAccessPreview();
    $('signup-student-identity-panel').hidden = authMode !== 'signup' || ($('auth-role').value === 'teacher' && !identityCompletionMode);
    const selected = $('auth-university').selectedOptions?.[0];
    const institution = $('auth-university').value && selected ? selected.textContent.split(' · ')[0] : '';
    $('identity-institution-search').value = institution;
    $('identity-institution').value = institution;
  });

  $('auth-staff-position').addEventListener('change', updateStaffPositionAccessPreview);

  $('auth-university').addEventListener('change', () => {
    const selected = $('auth-university').selectedOptions?.[0];
    const institution = $('auth-university').value && selected ? selected.textContent.split(' · ')[0] : '';
    $('identity-institution-search').value = institution;
    $('identity-institution').value = institution;
  });

  document.querySelectorAll('[data-auth-mode]').forEach(button =>
    button.addEventListener('click', () => {
      if (!authBusy) setAuthMode(button.dataset.authMode);
    })
  );

  async function handleForgotPassword() {
    const backend = window.CampusShieldBackend;
    const email = $('auth-email').value.trim();
    const message = $('auth-message');
    const button = $('forgot-password-button');

    if (!email) {
      message.textContent = 'Enter your email address first, then choose Forgot password.';
      $('auth-email').focus();
      return;
    }
    if (!$('auth-email').checkValidity()) {
      message.textContent = 'Enter a valid email address.';
      $('auth-email').focus();
      return;
    }
    if (!backend?.isConfigured) {
      message.textContent = 'Supabase is not connected. Please try again later.';
      return;
    }
    if (authBusy) return;

    authBusy = true;
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Requesting reset link…';
    try {
      let redirectUrl;
      if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        const target = new URL(window.location.pathname, window.location.origin);
        target.searchParams.set('password-reset', '1');
        redirectUrl = target.toString();
      } else {
        redirectUrl = 'https://campusshield-ai.github.io/campusshield-ai/?password-reset=1';
      }
      const {error} = await backend.requestPasswordReset(email, redirectUrl);
      if (error) throw error;
      message.textContent = 'If an account exists for that email address, reset instructions have been requested. Check your inbox and spam folder.';
    } catch (error) {
      console.error('Password reset request failed:', error);
      const text = String(error?.message || '');
      message.textContent = /rate limit|too many requests/i.test(text)
        ? 'Too many reset requests. Please wait a while before trying again.'
        : 'Could not request a reset link right now. Check your connection and try again later.';
    } finally {
      authBusy = false;
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function handlePasswordReset() {
    const backend = window.CampusShieldBackend;
    const password = $('new-password').value;
    const confirmPassword = $('confirm-new-password').value;
    const message = $('auth-message');
    if (!backend?.isConfigured) {
      message.textContent = 'Supabase is not connected. Please try again later.';
      return;
    }
    if (!isStrongPasswordBaseline(password)) {
      message.textContent = 'Choose 12+ characters with uppercase and lowercase letters, at least one number and one symbol. Do not reuse passwords.';
      $('new-password').focus();
      return;
    }
    if (password !== confirmPassword) {
      message.textContent = 'The passwords do not match.';
      $('confirm-new-password').focus();
      return;
    }

    message.textContent = 'Updating your password…';
    const {error} = await backend.updatePassword(password);
    if (error) throw error;

    $('new-password').value = '';
    $('confirm-new-password').value = '';
    $('auth-password').value = '';
    passwordRecoveryActive = false;
    try {
      const {error:signOutError} = await backend.signOut();
      if (signOutError) console.warn('Password changed, but the recovery session could not be closed automatically.');
    } catch (signOutError) {
      console.warn('Password changed, but the recovery session could not be closed automatically.', signOutError);
    }
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (urlError) {
      console.warn('Could not clear the password-reset URL state.', urlError);
    }
    setAuthMode('signin');
    message.textContent = 'Your password has been updated. Sign in with your new password.';
  }

  $('forgot-password-button').addEventListener('click', handleForgotPassword);

  // Keep the visible workspace synchronized with the Supabase session.
  // Avoid asynchronous Supabase calls inside this auth callback.
  if (window.CampusShieldBackend?.client?.auth) {
    window.CampusShieldBackend.client.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        passwordRecoveryActive = true;
        currentProfile = null;
        $('workspace').hidden = true;
        $('login-screen').hidden = false;
        setAuthMode('reset');
        $('auth-message').textContent = 'Your reset link is ready. Choose a new password below.';
        return;
      }
      if (event === 'SIGNED_IN') authSessionVersion += 1;

      if (event === 'SIGNED_OUT') {
        authSessionVersion += 1;
        currentProfile = null;
        if (typeof resetShieldMindForSession === 'function') resetShieldMindForSession();
        communityProfile = null;
        campusContext = null;
        $('platform-admin-nav').hidden = true;
        $('platform-admin-tools').hidden = true;
        $('community-username-current').textContent = 'Not signed in';
        $('community-feed').innerHTML = '<div class="community-empty">Sign in to view campus updates.</div>';
        incidents = [];
        incidentsLastUpdated = null;
        if ($('campus-dashboard-classes')) $('campus-dashboard-classes').replaceChildren();
        if ($('campus-dashboard-announcements')) $('campus-dashboard-announcements').replaceChildren();
        if ($('campus-dashboard-updates')) $('campus-dashboard-updates').replaceChildren();
        if ($('campus-dashboard-status')) $('campus-dashboard-status').textContent = 'Sign in to load campus insights.';
        $('incidentSyncStatus').textContent = 'Signed out';
        $('incidentSyncStatus').dataset.state = 'idle';
        render();
        showLogin('You have signed out. Please sign in to continue.');
      }
    });
  }


  // Sidebar controls: remember desktop collapse preference, while mobile uses a modal drawer.
  (() => {
    const app = document.querySelector('.app');
    const sidebar = $('app-sidebar');
    const collapseButton = $('sidebar-collapse-toggle');
    const mobileButton = $('mobile-nav-toggle');
    const backdrop = $('sidebar-backdrop');
    if (!app || !sidebar || !collapseButton || !mobileButton || !backdrop) return;
    const mobile = () => window.matchMedia('(max-width: 650px)').matches;
    try { if (localStorage.getItem('campusshield-sidebar-collapsed') === 'true' && !mobile()) app.classList.add('sidebar-collapsed'); } catch (_) {}
    const sync = () => {
      const collapsed = app.classList.contains('sidebar-collapsed');
      collapseButton.setAttribute('aria-expanded', String(!collapsed));
      collapseButton.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      collapseButton.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
      collapseButton.querySelector('span:first-child').textContent = collapsed ? '›' : '‹';
      mobileButton.setAttribute('aria-expanded', String(app.classList.contains('mobile-nav-open')));
      mobileButton.setAttribute('aria-label', app.classList.contains('mobile-nav-open') ? 'Close navigation menu' : 'Open navigation menu');
      backdrop.hidden = !app.classList.contains('mobile-nav-open');
    };
    const closeMobile = () => { app.classList.remove('mobile-nav-open'); sync(); };
    collapseButton.addEventListener('click', () => {
      if (mobile()) { closeMobile(); return; }
      app.classList.toggle('sidebar-collapsed');
      try { localStorage.setItem('campusshield-sidebar-collapsed', String(app.classList.contains('sidebar-collapsed'))); } catch (_) {}
      sync();
    });
    mobileButton.addEventListener('click', () => { app.classList.toggle('mobile-nav-open'); sync(); });
    backdrop.addEventListener('click', closeMobile);
    sidebar.querySelectorAll('button[data-page]').forEach(button => {
      const label = button.textContent.trim().replace(/\s+/g, ' ');
      if (label) { button.title = label; button.setAttribute('aria-label', label); }
      button.addEventListener('click', () => { if (mobile()) closeMobile(); });
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMobile(); });
    window.addEventListener('resize', () => { if (!mobile()) closeMobile(); sync(); });
    sync();
  })();

  function navigate(page) {
    if (!currentProfile) {
      showLogin('Please sign in to access CampusShield.');
      return;
    }
    if (page === 'past-questions' && !window.PastQuestionPractice?.isEnabled?.()) {
      page = 'dashboard';
      toast('Past Questions & Exam Prep is coming soon. We’re preparing verified study materials before launch.');
    }

    // Session restoration can request Overview more than once. Honor a valid
    // notification deep link until the user interacts with the workspace.
    if (page === 'dashboard' && pendingNotificationPage) {
      const target = pendingNotificationPage;
      if (['campus-messages', 'noticeboard'].includes(target) &&
          currentProfile.verification_status !== 'verified') {
        clearPendingNotificationPage();
        toast('This notification destination requires a verified account. Showing Overview.');
      } else {
        page = target;
      }
    }

    const verified = currentProfile.verification_status === 'verified';
    const verifiedAdmin = verified && currentProfile.role === 'admin';

    // Keep the navigation consistent with the signed-in role even if the
    // async admin-rewards helper has not initialized yet.
    const studentRewardsNav = document.getElementById('student-rewards-nav');
    const adminRewardsNav = document.getElementById('admin-rewards-nav');
    if (studentRewardsNav) studentRewardsNav.hidden = currentProfile.role !== 'student';
    if (adminRewardsNav) adminRewardsNav.hidden = !verifiedAdmin;

    // If a non-student opens the student-only route, send verified admins to
    // the separate cross-campus management view instead of showing a dead end.
    if (page === 'student-rewards' && currentProfile.role !== 'student') {
      page = verifiedAdmin ? 'admin-rewards' : 'dashboard';
      toast(verifiedAdmin
        ? 'Opening administrator Rewards Management.'
        : 'Challenges and rewards are available to student accounts only.');
    }

    if (page === 'staff-verification' && currentProfile.role !== 'teacher') {
      page = 'dashboard';
      toast('Staff identity verification is available only to staff accounts.');
    }

    if (['manage', 'risk', 'analytics'].includes(page) && !canManageIncidents()) {
      page = 'dashboard';
      toast('Incident management and risk analytics are restricted to verified security and administrator accounts.');
    }

    if (page === 'admin-rewards' && !verifiedAdmin) {
      page = 'dashboard';
      toast('Rewards Management is restricted to verified administrators.');
    }

    if (page === 'approvals' && !verifiedAdmin) {
      page = 'dashboard';
      toast('Only verified administrators can access account approvals.');
    }
    if (page === 'classroom' &&
        (!verified || !hasVerifiedCampusStaffMembership() || !['teacher','security','admin'].includes(currentProfile.role))) {
      page = 'dashboard';
      toast('Teacher Classroom requires a verified campus staff account.');
    }
    if (page === 'opportunities' && (!verified || !hasVerifiedCampusStaffMembership())) {
      page = 'dashboard';
      toast('The Opportunities Hub requires a verified account and university membership.');
    }
    // ShieldMind and plan information are available to all signed-in users.
    // The Edge Function applies its own eligibility rules only to protected capabilities.

    document.querySelectorAll('.page').forEach(el =>
      el.classList.toggle('active', el.id === 'page-' + page)
    );

    document.querySelectorAll('[data-page]').forEach(el => {
      const active = el.dataset.page === page ||
        (el.id === 'community-nav' && page === 'groups') ||
        (el.id === 'events-services-nav' && ['noticeboard','helpdesk','marketplace'].includes(page));
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });

    const names = {
      dashboard:'Overview',
      academics:'Academic Life',
      timetable:'My Timetable',
      report:'Safety & Report Incident',
      manage:'Incident management',
      risk:'Risk analysis',
      analytics:'Analytics & reports',
      approvals:'Account approvals',
      'platform-admin':'Platform administration',
      noticeboard:'Verified noticeboard',
      helpdesk:'Campus Helpdesk',
      'campus-contacts':'Campus service contacts',
      community:'CampusPulse & Groups',
      'campus-chat':'Campus Chat',
      'campus-messages':'Private Messages',
      groups:'Campus groups',
      events:'Events & Campus Services',
      marketplace:'Campus marketplace',
      classroom:'Teacher Classroom',
      courses:'Courses & Study Resources',
      'past-questions':'Past Questions & Exam Prep',
      'student-rewards':'Challenges & Rewards',
      opportunities:'Opportunities & Scholarships',
      shieldmind:'ShieldMind AI',
      billing:'Subscriptions & Billing',
      'profile-settings':'My Profile & Settings',
      'staff-verification':'Staff verification',
      'staff-review':'Staff applications',
    };

    $('sectionTitle').textContent = names[page] || 'Overview';

    if (page === 'student-rewards') window.CampusShieldStudentRewards?.load({ force: true });
    if (page === 'past-questions') window.PastQuestionPractice?.load(currentProfile);
    if (page === 'analytics') renderAnalytics();
  }

  function consumeGoogleOAuthHints(profile, context) {
    let pending = false, expectedRole = "student", institutionHint = "";
    try {
      pending = sessionStorage.getItem("campusshield_google_oauth_pending") === "true";
      if (!pending) return false;
      expectedRole = sessionStorage.getItem("campusshield_google_expected_role") || "student";
      institutionHint = sessionStorage.getItem("campusshield_google_institution_hint") || "";
      sessionStorage.removeItem("campusshield_google_oauth_pending");
      sessionStorage.removeItem("campusshield_google_expected_role");
      sessionStorage.removeItem("campusshield_google_institution_hint");
    } catch (_error) {
      return;
    }
    const normalize = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const wantedRole = expectedRole === "administrator" ? "admin" : expectedRole;
    const actualRole = profile?.requested_role || profile?.role || "student";
    if (wantedRole && actualRole !== wantedRole) {
      toast("Google sign-in succeeded. Your verified/requested role is " + actualRole + "; the selected role is only a hint and does not change permissions.");
    }
    if (institutionHint && context?.university_name && normalize(institutionHint) !== normalize(context.university_name)) {
      toast("Google sign-in succeeded, but your verified campus is " + context.university_name + ". The institution field does not change campus membership.");
    } else if (institutionHint && !context?.university_id) {
      toast("Google sign-in succeeded. Select and verify " + institutionHint + " from the campus directory to finish campus onboarding.");
    }
    if (profile?.verification_status !== "verified") {
      $('auth-message').textContent = "Google sign-in succeeded. Your account remains pending until the required campus and identity verification is complete.";
    } else {
      $('auth-message').textContent = "Google sign-in succeeded. Your account permissions are based on its verified CampusShield profile.";
    }
    return true;
  }

  async function loadCampusDashboardInsights() {
    const panel = $('campus-dashboard-panel');
    if (!panel || !currentProfile) return;
    const requestId = (loadCampusDashboardInsights.requestId || 0) + 1;
    loadCampusDashboardInsights.requestId = requestId;
    const requestSessionVersion = authSessionVersion;
    const requestProfile = currentProfile;
    const status = $('campus-dashboard-status');
    const role = String(currentProfile.role || 'student').toLowerCase();
    const isTeacher = role === 'teacher';
    const isAdmin = role === 'admin';
    const isVerified = currentProfile.verification_status === 'verified';
    $('campus-dashboard-role').textContent = (isAdmin ? 'Administrator' : isTeacher ? 'Teacher' : 'Student') + (isVerified ? ' · Verified' : ' · Pending');
    $('campus-dashboard-heading').textContent = isTeacher ? 'Your teaching workspace' : isAdmin ? 'Your university workspace' : 'Your student dashboard';
    $('campus-dashboard-description').textContent = isTeacher
      ? 'Manage your classrooms, see recent learning activity and keep students informed.'
      : isAdmin
        ? 'Review campus activity and stay on top of trusted university updates.'
        : 'Your classes, learning announcements, campus events and safety activity in one place.';
    $('campus-dashboard-classes-title').textContent = isTeacher ? 'My Classrooms' : 'My Classes';
    $('campus-metric-classes-label').textContent = isTeacher ? 'My Classrooms' : 'My Classes';
    $('campus-metric-classes-note').textContent = isTeacher ? 'Classes you manage' : 'Classes available to your account';
    $('campus-metric-secondary-label').textContent = isTeacher ? 'Students in my classes' : 'Class Announcements';
    $('campus-metric-secondary-note').textContent = isTeacher ? 'Roster totals for classes you own' : 'Recent updates from your classes';
    $('campus-dashboard-teacher-actions').hidden = !isTeacher;

    const clearFeed = (id, message) => {
      const feed = $(id);
      if (!feed) return;
      feed.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'campus-dashboard-empty';
      empty.textContent = message;
      feed.appendChild(empty);
    };
    const appendItem = (parent, title, meta, body, actionLabel, action) => {
      const item = document.createElement('article');
      item.className = 'campus-dashboard-list-item';
      const strong = document.createElement('strong');
      strong.textContent = String(title || 'Untitled');
      item.appendChild(strong);
      if (meta) {
        const metaNode = document.createElement('p');
        metaNode.textContent = String(meta);
        item.appendChild(metaNode);
      }
      if (body) {
        const bodyNode = document.createElement('p');
        bodyNode.textContent = String(body);
        item.appendChild(bodyNode);
      }
      if (actionLabel && action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn secondary';
        button.textContent = actionLabel;
        button.addEventListener('click', action);
        item.appendChild(button);
      }
      parent.appendChild(item);
    };
    const backend = window.CampusShieldBackend;
    if (!isVerified || !backend?.isConfigured) {
      status.textContent = 'Verify your CampusShield account to load a personalized campus overview.';
      clearFeed('campus-dashboard-classes', 'Your classes appear after campus verification.');
      clearFeed('campus-dashboard-announcements', 'Class announcements appear after campus verification.');
      clearFeed('campus-dashboard-updates', 'Verified notices and events appear after campus verification.');
      clearFeed('campus-dashboard-helpdesk', 'Your service request status appears after campus verification.');
      $('campus-dashboard-helpdesk-count').textContent = '—';
      $('campus-metric-classes').textContent = '—';
      $('campus-metric-secondary').textContent = '—';
      $('campus-metric-events').textContent = '—';
      $('campus-metric-incidents').textContent = String((incidents || []).filter(i => !isResolvedStatus(i.status)).length);
      return;
    }
    try {
      const context = await backend.getMyCampusContext();
      if (requestId !== loadCampusDashboardInsights.requestId || requestSessionVersion !== authSessionVersion || currentProfile !== requestProfile) return;
      campusContext = context;
      if (!context?.university_id || context.membership_status !== 'active' || context.verification_status !== 'verified') {
        status.textContent = 'Choose and verify your university membership to load campus-specific learning information.';
        clearFeed('campus-dashboard-classes', 'A verified campus membership is required.');
        clearFeed('campus-dashboard-announcements', 'A verified campus membership is required.');
        clearFeed('campus-dashboard-updates', 'A verified campus membership is required.');
        clearFeed('campus-dashboard-helpdesk', 'Choose and verify your university to load your service requests.');
        $('campus-dashboard-helpdesk-count').textContent = '—';
        $('campus-metric-classes').textContent = '—';
        $('campus-metric-secondary').textContent = '—';
        $('campus-metric-events').textContent = '—';
        $('campus-metric-incidents').textContent = String((incidents || []).filter(i => !isResolvedStatus(i.status)).length);
        return;
      }

      status.textContent = 'Loading your campus data…';
      const campusId = context.university_id;
      const results = await Promise.all([
        backend.listCampusClassrooms().catch(() => []),
        backend.listCampusNotices().catch(() => []),
        backend.listCampusEvents().catch(() => []),
        backend.listCampusHelpdeskTickets().catch(() => null),
        backend.getCurrentUser().catch(() => null)
      ]);
      const classes = (results[0] || []).filter(row => row.university_id === campusId);
      const notices = (results[1] || []).filter(row => row.university_id === campusId &&
        (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()));
      if (requestId !== loadCampusDashboardInsights.requestId || requestSessionVersion !== authSessionVersion || currentProfile !== requestProfile) return;
      const allEvents = (results[2] || []).filter(row => row.university_id === campusId);
      const helpdeskDataAvailable = Array.isArray(results[3]) && !!results[4]?.id;
      const ownHelpdeskTickets = helpdeskDataAvailable
        ? results[3].filter(row => row.university_id === campusId && row.created_by === results[4].id)
          .sort((a,b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
        : [];
      const upcomingEvents = allEvents.filter(row => row.starts_at && new Date(row.starts_at).getTime() >= Date.now())
        .sort((a,b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
      const now = Date.now();
      const classroomAnnouncements = [];
      const rosterCounts = [];
      for (const classroom of classes.slice(0, 30)) {
        try {
          const rows = await backend.listCampusClassroomAnnouncements(classroom.id);
          (rows || []).forEach(row => classroomAnnouncements.push({
            id: row.id, classroom_id: classroom.id, classroom_name: classroom.name,
            title: row.title, body: row.body, created_at: row.created_at, kind: 'class'
          }));
        } catch (_error) {
          // An inaccessible class contributes no announcement content.
        }
        if (isTeacher) {
          try {
            const roster = await backend.listCampusClassroomRoster(classroom.id);
            rosterCounts.push({classroom_id:classroom.id, count:(roster||[]).length});
          } catch (_error) {
            // The roster RPC permits only the verified teacher who owns the class.
          }
        }
      }
      classroomAnnouncements.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const visibleAnnouncements = classroomAnnouncements.slice(0, 5);
      const totalStudents = new Map();
      // Each classroom roster is owner-protected; sum only those authorized responses.
      rosterCounts.forEach(item => totalStudents.set(item.classroom_id, item.count));
      if (requestId !== loadCampusDashboardInsights.requestId || requestSessionVersion !== authSessionVersion || currentProfile !== requestProfile) return;
      const studentCount = Array.from(totalStudents.values()).reduce((sum,value) => sum + value, 0);

      $('campus-metric-classes').textContent = String(classes.length);
      $('campus-metric-secondary').textContent = String(isTeacher ? studentCount : classroomAnnouncements.length);
      $('campus-metric-events').textContent = String(upcomingEvents.length);
      $('campus-metric-incidents').textContent = String((incidents || []).filter(i => !isResolvedStatus(i.status)).length);
      const helpdeskCount = $('campus-dashboard-helpdesk-count');
      const helpdeskFeed = $('campus-dashboard-helpdesk');
      helpdeskFeed.replaceChildren();
      if (!helpdeskDataAvailable) {
        helpdeskCount.textContent = '—';
        clearFeed('campus-dashboard-helpdesk', 'Helpdesk status is temporarily unavailable. Open Helpdesk to try again.');
      } else {
        const openHelpdeskTickets = ownHelpdeskTickets.filter(ticket => !isResolvedStatus(ticket.status));
        helpdeskCount.textContent = String(openHelpdeskTickets.length);
        if (!ownHelpdeskTickets.length) {
          clearFeed('campus-dashboard-helpdesk', 'No service requests have been submitted from your account yet.');
        } else {
          ownHelpdeskTickets.slice(0, 3).forEach(ticket => appendItem(
            helpdeskFeed,
            ticket.title || 'Campus service request',
            'Reference ' + String(ticket.reference_code || 'pending') + ' · ' + String(ticket.status || 'Status unavailable'),
            ticket.assigned_department ? 'Assigned to ' + ticket.assigned_department : String(ticket.category || 'Campus service request'),
            'View status',
            () => { navigate('helpdesk'); loadCampusHelpdeskPage(); }
          ));
        }
      }
      if (isTeacher && !rosterCounts.length) $('campus-metric-secondary-note').textContent = 'Owned class rosters are available to their verified teacher';
      else if (isTeacher) $('campus-metric-secondary-note').textContent = 'Across classrooms you own';
      else $('campus-metric-secondary-note').textContent = 'Updates from your authorized classrooms';
      const classFeed = $('campus-dashboard-classes');
      classFeed.replaceChildren();
      if (!classes.length) clearFeed('campus-dashboard-classes', isTeacher ? 'Create your first classroom to share announcements and course materials.' : 'Join a classroom with the private code provided by your verified teacher.');
      else classes.slice(0,4).forEach(row => appendItem(
        classFeed, row.name, row.subject, row.description || 'Private class space for announcements and learning links.',
        'Open class', () => { navigate('classroom'); loadCampusClassroomsPage(); loadCampusClassroomDetail(row.id); }
      ));

      const announcementFeed = $('campus-dashboard-announcements');
      announcementFeed.replaceChildren();
      if (!visibleAnnouncements.length) clearFeed('campus-dashboard-announcements', 'No class announcements are available to your account yet.');
      else visibleAnnouncements.forEach(row => appendItem(
        announcementFeed, row.title, row.classroom_name + ' · ' + dateText(row.created_at), row.body,
        'Open class', () => { navigate('classroom'); loadCampusClassroomsPage(); loadCampusClassroomDetail(row.classroom_id); }
      ));

      const updateFeed = $('campus-dashboard-updates');
      updateFeed.replaceChildren();
      const updateCards = [];
      notices.slice().sort((a,b) => new Date(b.published_at || b.created_at).getTime() - new Date(a.published_at || a.created_at).getTime())
        .slice(0,3).forEach(row => updateCards.push({
          title: row.title, meta: 'Verified notice · ' + String(row.category || 'Campus update'),
          body: row.body, type: 'notice'
        }));
      upcomingEvents.slice(0,3).forEach(row => updateCards.push({
        title: row.title, meta: 'Upcoming event · ' + dateText(row.starts_at),
        body: row.location || row.description || 'Published campus event', type: 'event'
      }));
      if (!updateCards.length) clearFeed('campus-dashboard-updates', 'No active notices or upcoming events are published for your campus.');
      else updateCards.slice(0,5).forEach(row => appendItem(
        updateFeed, row.title, row.meta, row.body,
        row.type === 'notice' ? 'Open noticeboard' : 'View events',
        () => { navigate(row.type === 'notice' ? 'noticeboard' : 'events'); if (row.type === 'notice') loadCampusNoticeboardPage(); else loadCampusEventsPage(); }
      ));

      if (isTeacher && currentProfile?.role === 'teacher') {
        $('campus-dashboard-actions').hidden = true;
        $('campus-dashboard-teacher-actions').hidden = false;
      } else {
        $('campus-dashboard-actions').hidden = false;
        $('campus-dashboard-teacher-actions').hidden = true;
      }
      status.textContent = 'Updated ' + new Date().toLocaleTimeString() + '. Campus content is limited to your authorized university and classrooms.';
    } catch (_error) {
      status.textContent = 'Your campus overview could not be loaded. Use the Refresh data button or try again.';
    }
  }

  function profileSettingsTimeAgo(value) {
    const stamp = Date.parse(value || '');
    if (!Number.isFinite(stamp)) return 'Recently';
    const minutes = Math.max(0, Math.floor((Date.now() - stamp) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return minutes + ' min ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hr ago' : ' hrs ago');
    const days = Math.floor(hours / 24);
    if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
    return new Date(stamp).toLocaleDateString();
  }

  function pushAppSupportsConfiguredProject() {
    try {
      const hostname = new URL(String(window.CAMPUSSHIELD_SUPABASE_CONFIG?.url || "")).hostname;
      return hostname === "hywcpnoqqhxvujnimhxl.supabase.co" ||
        hostname === "fvgtnujjnvdkhzqqcaqe.supabase.co";
    } catch (_) { return false; }
  }

  function pushPublicKeyBytes(value) {
    const encoded = String(value || "").trim();
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("The push public key is not valid.");
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - encoded.length % 4) % 4);
    const decoded = atob(padded);
    return Uint8Array.from(decoded, function(character) { return character.charCodeAt(0); });
  }

  async function loadProfileSettingsPush(user, backend) {
    const status = $("profile-push-settings-status");
    const enableButton = $("profile-push-enable");
    const testButton = $("profile-push-test");
    const disableButton = $("profile-push-disable");
    if (!status || !enableButton || !testButton || !disableButton) return;
    enableButton.disabled = !user;
    testButton.disabled = !user;
    disableButton.disabled = !user;

    if (!pushAppSupportsConfiguredProject()) {
      status.textContent = "Background push is unavailable for this Supabase environment. Use the configured CampusShield AI production or staging project.";
      enableButton.hidden = true;
      testButton.hidden = true;
      disableButton.hidden = true;
      return;
    }
    if (!user) {
      status.textContent = "Sign in to manage background notifications on this device.";
      enableButton.hidden = false;
      testButton.hidden = true;
      disableButton.hidden = true;
      return;
    }
    if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      status.textContent = "This browser does not support background push notifications here. Use a supported browser on HTTPS or localhost.";
      enableButton.hidden = true;
      testButton.hidden = true;
      disableButton.hidden = true;
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration("./");
      const subscription = registration?.pushManager ? await registration.pushManager.getSubscription() : null;
      const subscribed = Boolean(subscription);
      status.textContent = subscribed
        ? "Background notifications are enabled on this device."
        : Notification.permission === "denied"
          ? "Notifications are blocked in browser settings. Allow them there before enabling push."
          : "Background notifications are off on this device.";
      enableButton.hidden = subscribed || Notification.permission === "denied";
      testButton.hidden = !subscribed;
      disableButton.hidden = !subscribed;
      enableButton.disabled = false;
      testButton.disabled = false;
      disableButton.disabled = false;
    } catch (_) {
      status.textContent = "Could not read this device's push settings. Reload the page and try again.";
    }
  }

  async function loadProfileSettingsAlerts(user, backend) {
    const list = $('profile-settings-alerts');
    const status = $('profile-settings-alerts-status');
    const allReadButton = $('profile-settings-mark-all-read');
    if (!list || !status || !user) return;
    list.replaceChildren();
    status.textContent = 'Loading your latest updates…';
    if (allReadButton) allReadButton.disabled = true;

    try {
      const tickets = await backend.listCampusHelpdeskTickets();
      const canSeeCampusQueue = currentProfile?.role === 'admin' && canModerateCommunity();
      let rows = [];

      if (canSeeCampusQueue) {
        const recentCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
        rows = tickets
          .filter(function(ticket) {
            const createdAt = Date.parse(ticket.created_at || '');
            return Number.isFinite(createdAt) && createdAt >= recentCutoff;
          })
          .map(function(ticket) {
            const detailParts = [ticket.location || ticket.category || 'Campus service', ticket.priority ? String(ticket.priority) + ' priority' : null];
            return {
              id: 'ticket:' + String(ticket.id),
              title: 'New helpdesk request: ' + String(ticket.title || 'Untitled request'),
              meta: detailParts.filter(Boolean).join(' · '),
              time: ticket.created_at,
              type: 'request'
            };
          });
      } else {
        const mine = tickets.filter(function(ticket) { return String(ticket.created_by) === String(user.id); });
        const updates = await backend.listCampusHelpdeskTicketUpdates(mine.map(function(ticket) { return ticket.id; }));
        const mineById = new Map(mine.map(function(ticket) { return [String(ticket.id), ticket]; }));
        const recentCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
        rows = updates
          .filter(function(update) {
            const createdAt = Date.parse(update.created_at || '');
            return String(update.author_id) !== String(user.id) &&
              Number.isFinite(createdAt) && createdAt >= recentCutoff &&
              mineById.has(String(update.ticket_id));
          })
          .map(function(update) {
            const ticket = mineById.get(String(update.ticket_id));
            const message = String(update.message || update.to_status || 'Your request was updated').trim();
            return {
              id: 'update:' + String(update.id),
              title: 'Helpdesk update: ' + String(ticket.title || 'Your campus request'),
              meta: String(update.author_label || 'Campus staff') + ' · ' + message,
              time: update.created_at,
              type: 'update'
            };
          });
      }

      rows.sort(function(a, b) { return Date.parse(b.time || '') - Date.parse(a.time || ''); });
      rows = rows.slice(0, 8);
      const storageKey = 'campusshield.profile-alerts.v1.' + String(user.id) + '.' + String(campusContext?.university_id || 'personal');
      let readIds = new Set();
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (Array.isArray(stored)) readIds = new Set(stored.map(String));
      } catch (_storageError) {
        readIds = new Set();
      }

      function persistReadIds() {
        try { localStorage.setItem(storageKey, JSON.stringify(Array.from(readIds).slice(-200))); }
        catch (_storageError) { /* Reading alerts still works if local storage is unavailable. */ }
      }

      function renderAlerts() {
        list.replaceChildren();
        const unreadCount = rows.filter(function(row) { return !readIds.has(row.id); }).length;
        status.textContent = unreadCount + ' unread update' + (unreadCount === 1 ? '' : 's') + ' · read status is saved on this device.';
        if (allReadButton) allReadButton.disabled = !rows.length || unreadCount === 0;

        if (!rows.length) {
          const empty = document.createElement('div');
          empty.className = 'profile-alert-empty';
          const heading = document.createElement('strong');
          heading.textContent = 'You’re all caught up';
          const copy = document.createElement('p');
          copy.textContent = canSeeCampusQueue
            ? 'New campus helpdesk requests from the last seven days will appear here.'
            : 'Replies to your campus helpdesk requests will appear here.';
          copy.style.margin = '0';
          empty.append(heading, copy);
          list.appendChild(empty);
          return;
        }

        rows.forEach(function(row) {
          const isRead = readIds.has(row.id);
          const item = document.createElement('article');
          item.className = 'profile-alert-item' + (isRead ? ' is-read' : '');
          const icon = document.createElement('div');
          icon.className = 'profile-alert-icon';
          icon.setAttribute('aria-hidden', 'true');
          icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg>';
          const content = document.createElement('div');
          content.className = 'profile-alert-content';
          const title = document.createElement('h3');
          title.className = 'profile-alert-title';
          title.textContent = row.title;
          const meta = document.createElement('p');
          meta.className = 'profile-alert-meta';
          meta.textContent = row.meta;
          const time = document.createElement('p');
          time.className = 'profile-alert-time';
          time.textContent = profileSettingsTimeAgo(row.time);
          const actions = document.createElement('div');
          actions.className = 'profile-alert-actions';
          const open = document.createElement('button');
          open.type = 'button';
          open.className = 'profile-alert-action profile-alert-open';
          open.textContent = 'Open';
          open.dataset.page = 'helpdesk';
          actions.appendChild(open);
          if (isRead) {
            const read = document.createElement('span');
            read.className = 'profile-alert-read-indicator';
            read.textContent = 'Read';
            actions.appendChild(read);
          } else {
            const markRead = document.createElement('button');
            markRead.type = 'button';
            markRead.className = 'profile-alert-action';
            markRead.textContent = 'Mark read';
            markRead.addEventListener('click', function() {
              readIds.add(row.id);
              persistReadIds();
              renderAlerts();
            });
            actions.appendChild(markRead);
          }
          content.append(title, meta, time, actions);
          item.append(icon, content);
          list.appendChild(item);
        });
      }

      if (allReadButton) {
        allReadButton.onclick = function() {
          rows.forEach(function(row) { readIds.add(row.id); });
          persistReadIds();
          renderAlerts();
        };
      }
      renderAlerts();
    } catch (error) {
      list.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'profile-alert-empty';
      const heading = document.createElement('strong');
      heading.textContent = 'Alerts are temporarily unavailable';
      const copy = document.createElement('p');
      copy.textContent = 'Open Helpdesk to check your latest campus requests.';
      copy.style.margin = '0';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn secondary';
      open.dataset.page = 'helpdesk';
      open.textContent = 'Open Helpdesk';
      open.style.marginTop = '12px';
      empty.append(heading, copy, open);
      list.appendChild(empty);
      status.textContent = 'Could not refresh helpdesk updates.';
      console.warn('Could not load profile alerts:', error);
    }
  }

  // Accept uploads up to 20 MiB, verify the file signature (not just its name/MIME),
  // then normalize to a compact WebP avatar suitable for the existing private bucket.
  const PROFILE_AVATAR_INPUT_LIMIT = 20 * 1024 * 1024;
  const PROFILE_AVATAR_OUTPUT_LIMIT = 2.7 * 1024 * 1024;

  async function prepareProfileAvatar(file) {
    if (!file || !Number.isFinite(file.size) || file.size < 1) {
      throw new Error('Choose a non-empty JPG, PNG or WebP image.');
    }
    if (file.size > PROFILE_AVATAR_INPUT_LIMIT) {
      throw new Error('This image is larger than 20 MB. Choose a smaller image.');
    }
    const signatures = [
      { type: 'image/jpeg', ext: 'jpg', test: b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
      { type: 'image/png', ext: 'png', test: b => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
      { type: 'image/webp', ext: 'webp', test: b => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 }
    ];
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const detected = signatures.find(item => item.test(header));
    if (!detected || (file.type && file.type !== detected.type)) {
      throw new Error('The file content does not match a supported JPG, PNG or WebP image. Please choose a valid image.');
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (_) {
      throw new Error('This image could not be opened. Try a valid JPG, PNG or WebP file.');
    }
    try {
      let width = bitmap.width;
      let height = bitmap.height;
      if (!width || !height) throw new Error('This image has invalid dimensions.');
      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image compression is unavailable in this browser.');
      for (let attempt = 0; attempt < 7; attempt++) {
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        const quality = Math.max(0.48, 0.9 - attempt * 0.07);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob || blob.type !== 'image/webp') {
          throw new Error('This browser cannot prepare a secure WebP photo. Update your browser and try again.');
        }
        if (blob.size <= PROFILE_AVATAR_OUTPUT_LIMIT) {
          const output = new File([blob], 'profile-avatar.webp', { type: 'image/webp', lastModified: Date.now() });
          return { file: output, originalSize: file.size, compressedSize: output.size, sourceType: detected.type };
        }
        width = Math.max(320, Math.round(width * 0.82));
        height = Math.max(320, Math.round(height * 0.82));
      }
      throw new Error('This image could not be compressed enough. Try a smaller image.');
    } finally {
      bitmap.close?.();
    }
  }

  let profileAvatarPreviewUrl = null;
  const profileAvatarObjectUrls = new Map();
  const profileAvatarRenderTokens = new Map();

  async function renderProfileAvatar(backend, avatarPath, imageId = 'profile-settings-avatar', fallbackId = 'profile-settings-avatar-fallback') {
    const image = $(imageId);
    const fallback = $(fallbackId);
    if (!image || !fallback) return false;
    const renderToken = (profileAvatarRenderTokens.get(imageId) || 0) + 1;
    profileAvatarRenderTokens.set(imageId, renderToken);
    image.hidden = true;
    fallback.hidden = false;
    image.removeAttribute('src');
    const previousObjectUrl = profileAvatarObjectUrls.get(imageId);
    if (previousObjectUrl) {
      URL.revokeObjectURL(previousObjectUrl);
      profileAvatarObjectUrls.delete(imageId);
    }
    if (!avatarPath || !backend?.client) return false;
    const bucket = backend.client.storage.from('campus-profile-avatars');
    try {
      // Prefer an authenticated download from the private bucket. This avoids
      // stale/blocked signed image URLs and still enforces the user's storage RLS.
      const { data: blob, error: downloadError } = await bucket.download(String(avatarPath));
      if (profileAvatarRenderTokens.get(imageId) !== renderToken) return false;
      if (!downloadError && blob instanceof Blob && blob.size > 0 && /^image\/(jpeg|png|webp)$/i.test(blob.type || '')) {
        const objectUrl = URL.createObjectURL(blob);
        profileAvatarObjectUrls.set(imageId, objectUrl);
        image.onload = function() {
          if (profileAvatarRenderTokens.get(imageId) !== renderToken) return;
          image.hidden = false;
          fallback.hidden = true;
        };
        image.onerror = function() {
          if (profileAvatarRenderTokens.get(imageId) !== renderToken) return;
          image.hidden = true;
          fallback.hidden = false;
          URL.revokeObjectURL(objectUrl);
          profileAvatarObjectUrls.delete(imageId);
        };
        image.src = objectUrl;
        return true;
      }

      // Fall back to a short-lived signed URL if download failed.
      const { data, error } = await bucket.createSignedUrl(String(avatarPath), 3600);
      if (profileAvatarRenderTokens.get(imageId) !== renderToken) return false;
      if (error || !data?.signedUrl) throw (downloadError || error || new Error('The private profile image could not be retrieved.'));
      const loaded = await new Promise(resolve => {
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = data.signedUrl;
      });
      if (profileAvatarRenderTokens.get(imageId) !== renderToken) return false;
      image.hidden = !loaded;
      fallback.hidden = loaded;
      if (!loaded) throw new Error('The saved profile image could not be displayed.');
      return true;
    } catch (error) {
      if (profileAvatarRenderTokens.get(imageId) !== renderToken) return false;
      image.hidden = true;
      fallback.hidden = false;
      const status = $('profile-settings-identity-message');
      if (status && imageId === 'profile-settings-avatar-preview') {
        status.textContent = 'Your profile photo could not be loaded. Please choose the image again and save your profile. ' + (error?.message || '');
      }
      return false;
    }
  }

  function updateDashboardWelcomeName(value) {
    const target = $('campus-dashboard-welcome-name');
    if (!target) return;
    const name = String(value || '').trim();
    target.textContent = name || 'CampusShield';
  }

  async function syncDashboardProfileIdentity() {
    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured || !backend?.client) return;
    const { data: authData, error: authError } = await backend.client.auth.getUser();
    if (authError || !authData?.user) return;
    const user = authData.user;
    const { data: saved, error } = await backend.client
      .from('profiles')
      .select('display_name, avatar_path')
      .eq('id', user.id)
      .single();
    if (error || !saved) return;
    // Do not let a late response for a previous session overwrite the current account.
    const { data: latestAuth } = await backend.client.auth.getUser();
    if (latestAuth?.user?.id !== user.id) return;
    Object.assign(currentProfile || {}, saved);
    const metadata = user.user_metadata || {};
    const displayName = String(saved.display_name || saved.full_name || saved.name ||
      metadata.display_name || metadata.full_name || metadata.name || '').trim();
    updateDashboardWelcomeName(displayName);
    await renderProfileAvatar(backend, saved.avatar_path);
  }

  async function loadMyProfileSettings() {
    const profile = currentProfile;
    if (!profile) return;
    const name = $('profile-settings-name');
    const email = $('profile-settings-email');
    const role = $('profile-settings-role');
    const verification = $('profile-settings-verification');
    const campus = $('profile-settings-campus');
    const membership = $('profile-settings-membership');
    const message = $('profile-settings-message');
    const identityPanel = $('profile-settings-identity-panel');
    const identityStatus = $('profile-settings-identity-status');
    if (name) name.textContent = profile.display_name || profile.full_name || profile.name || 'Name not provided';
    updateDashboardWelcomeName(profile.display_name || profile.full_name || profile.name);
    if (role) role.textContent = String(profile.role || 'member').replace(/_/g, ' ').replace(/\b\w/g, function(char) { return char.toUpperCase(); });
    if (verification) {
      const verificationStatus = String(profile.verification_status || 'unknown').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      verification.textContent = verificationStatus.replace(/-/g, ' ');
      verification.className = 'profile-status-pill profile-status-' + verificationStatus;
    }
    if (identityPanel) identityPanel.hidden = !isStudentAccount();
    if (identityStatus) identityStatus.textContent = isStudentAccount()
      ? 'Checking private student identity status…'
      : 'This check is available to student accounts only.';
    if (email) email.textContent = 'Checking secure session…';
    if (message) message.textContent = 'Your private account details are shown only in your signed-in workspace.';

    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured) {
      if (email) email.textContent = 'Unavailable';
      if (message) message.textContent = 'Account details could not be refreshed because the secure backend is unavailable.';
      if ($('profile-settings-alerts-status')) $('profile-settings-alerts-status').textContent = 'The secure backend is unavailable.';
      return;
    }
    try {
      let context = null;
      try { context = await backend.getMyCampusContext(); } catch (_contextError) { context = null; }
      if (currentProfile !== profile) return;
      campusContext = context;
      const response = await backend.client.auth.getUser();
      const user = response?.data?.user;
      if (currentProfile !== profile) return;
      if (response?.error || !user) throw new Error('Your secure session could not be verified. Please sign in again.');
      const { data: editableProfile, error: editableProfileError } = await backend.client
        .from('profiles')
        .select('display_name, avatar_path')
        .eq('id', user.id)
        .single();
      if (editableProfileError) throw editableProfileError;
      Object.assign(profile, editableProfile || {});
      const metadata = user.user_metadata || {};
      const displayName = String(profile.display_name || metadata.display_name || metadata.full_name || metadata.name || '').trim();
      if (name) name.textContent = displayName || 'Name not provided';
      updateDashboardWelcomeName(displayName);
      const displayNameInput = $('profile-settings-display-name');
      if (displayNameInput) displayNameInput.value = displayName;
      const removeAvatarButton = $('profile-settings-remove-avatar');
      if (removeAvatarButton) {
        removeAvatarButton.hidden = !profile.avatar_path;
        removeAvatarButton.dataset.clearAvatar = 'false';
      }
      const identityMessage = $('profile-settings-identity-message');
      if (identityMessage) identityMessage.textContent = 'Update the name and picture shown on your account.';
      await renderProfileAvatar(backend, profile.avatar_path);
      await renderProfileAvatar(backend, profile.avatar_path, 'profile-settings-avatar-preview', 'profile-settings-avatar-preview-fallback');
      updateDashboardWelcomeName(displayName);
      if (email) email.textContent = user.email || 'Email is not available from this sign-in provider.';
      if (campus) campus.textContent = campusContext?.university_name || 'No university connected yet';
      if (membership) membership.textContent = campusContext?.membership_status === 'active' && campusContext?.verification_status === 'verified'
        ? 'Verified'
        : campusContext?.university_id ? 'Pending verification' : 'Not linked';

      const departmentInput = $('profile-settings-department');
      const phoneInput = $('profile-settings-contact-phone');
      if (departmentInput) departmentInput.value = String(metadata.department || '');
      if (phoneInput) phoneInput.value = String(metadata.contact_phone || '');

      if (isStudentAccount() && typeof backend.getMyStudentIdentityVerification === 'function') {
        try {
          const submission = await backend.getMyStudentIdentityVerification();
          if (currentProfile !== profile) return;
          studentIdentitySubmission = submission;
          if (identityStatus) identityStatus.textContent = !submission
            ? 'No student identity document has been submitted yet.'
            : submission.status === 'approved'
              ? 'Approved. Your identity document is not displayed here.'
              : submission.status === 'pending'
                ? 'Pending review. Your document remains in private storage.'
                : submission.status === 'rejected'
                  ? 'Rejected. Open student setup from Overview to review the next steps.'
                  : 'Status: ' + String(submission.status || 'unknown');
          syncIdentityNavigation();
        } catch (_identityError) {
          if (identityStatus) identityStatus.textContent = 'Student identity status is temporarily unavailable.';
        }
      }
      await loadProfileSettingsAlerts(user, backend);
      await loadProfileSettingsPush(user, backend);
    } catch (error) {
      if (email) email.textContent = 'Unavailable';
      if (message) message.textContent = error?.message || 'Account details could not be loaded.';
    }
  }

  document.addEventListener('click', async function(event) {
    const button = event.target?.closest?.("[data-push-action]");
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.pushAction;
    const backend = window.CampusShieldBackend;
    const status = $("profile-push-settings-status");
    const all = ["profile-push-enable", "profile-push-test", "profile-push-disable"]
      .map(function(id) { return $(id); }).filter(Boolean);
    if (!backend?.isConfigured || !currentProfile) {
      if (status) status.textContent = "Sign in before managing background notifications.";
      return;
    }
    if (!pushAppSupportsConfiguredProject()) {
      if (status) status.textContent = "Background push is unavailable for this Supabase environment.";
      return;
    }
    all.forEach(function(control) { control.disabled = true; });
    if (status) status.textContent = action === "enable"
      ? "Preparing secure notifications for this device…"
      : action === "test" ? "Sending a test notification…"
      : "Turning off notifications on this device…";
    try {
      if (action === "enable") {
        // Ask for permission before any network await so browsers retain the user gesture.
        if (Notification.permission !== "granted") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") throw new Error("Notification permission was not granted.");
        }
        const publicKey = await backend.getPushVapidPublicKey();
        await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: pushPublicKeyBytes(publicKey)
          });
        }
        await backend.savePushSubscription(subscription.toJSON());
        if (status) status.textContent = "Background notifications are enabled on this device.";
        await loadProfileSettingsPush(currentProfile, backend);
      } else if (action === "test") {
        let result = await backend.sendPushTest();
        let delivered = Number(result?.delivered) || 0;

        // A VAPID rotation or an expired browser endpoint can leave a local
        // subscription that the server has already removed. Repair it once
        // when the first test finds no active destination.
        if (delivered === 0 && result?.no_subscription === true) {
          if (status) status.textContent = "Refreshing this device's secure push subscription…";
          const publicKey = await backend.getPushVapidPublicKey();
          await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
          const registration = await navigator.serviceWorker.ready;
          const existing = registration?.pushManager
            ? await registration.pushManager.getSubscription()
            : null;
          if (existing) {
            try { await backend.removePushSubscription(existing.endpoint); } catch (_removeError) {
              // The server may already have removed an expired endpoint.
            }
            await existing.unsubscribe();
          }
          const renewed = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: pushPublicKeyBytes(publicKey)
          });
          await backend.savePushSubscription(renewed.toJSON());
          if (status) status.textContent = "Subscription refreshed. Sending a new test…";
          result = await backend.sendPushTest();
          delivered = Number(result?.delivered) || 0;
        }

        if (status) status.textContent = delivered > 0
          ? "Test notification sent to " + delivered + (delivered === 1 ? " device." : " devices.")
          : result?.no_subscription === true
            ? "No active server subscription was found. Enable notifications for this device and retry."
            : "Push delivery was not confirmed. The subscription was kept; check the staging push delivery logs.";
      } else if (action === "disable") {
        const registration = await navigator.serviceWorker.getRegistration("./");
        const subscription = registration?.pushManager ? await registration.pushManager.getSubscription() : null;
        if (subscription) {
          await backend.removePushSubscription(subscription.endpoint);
          await subscription.unsubscribe();
        }
        if (status) status.textContent = "Background notifications are off on this device.";
        await loadProfileSettingsPush(currentProfile, backend);
      } else {
        throw new Error("Unsupported push notification action.");
      }
    } catch (error) {
      if (status) status.textContent = error?.message || "Background notifications could not be updated.";
    } finally {
      all.forEach(function(control) { control.disabled = false; });
    }
  });

  const profileIdentityDialog = $('profile-settings-identity-dialog');
  const avatarTrigger = $('profile-settings-avatar-trigger');
  const closeProfileEditor = $('profile-settings-close-editor');

  if (avatarTrigger && profileIdentityDialog) {
    avatarTrigger.addEventListener('click', async function() {
      const nameInput = $('profile-settings-display-name');
      if (nameInput) nameInput.value = String(currentProfile?.display_name || $('profile-settings-name')?.textContent || '').trim();
      const fileInput = $('profile-settings-avatar-file');
      if (fileInput) fileInput.value = '';
      const removeButton = $('profile-settings-remove-avatar');
      if (removeButton) {
        removeButton.hidden = !currentProfile?.avatar_path;
        removeButton.dataset.clearAvatar = 'false';
      }
      const status = $('profile-settings-identity-message');
      if (status) status.textContent = 'Update the name and picture shown on your account.';
      if (typeof profileIdentityDialog.showModal === 'function') {
        profileIdentityDialog.showModal();
      } else {
        profileIdentityDialog.setAttribute('open', '');
      }
      await renderProfileAvatar(window.CampusShieldBackend, currentProfile?.avatar_path, 'profile-settings-avatar-preview', 'profile-settings-avatar-preview-fallback');
    });
  }
  if (closeProfileEditor && profileIdentityDialog) {
    closeProfileEditor.addEventListener('click', function() { profileIdentityDialog.close(); });
  }
  if (profileIdentityDialog) {
    profileIdentityDialog.addEventListener('click', function(event) {
      if (event.target === profileIdentityDialog) profileIdentityDialog.close();
    });
  }

  document.addEventListener('change', async function(event) {
    if (event.target?.id !== 'profile-settings-avatar-file') return;
    const input = event.target;
    const file = input.files?.[0];
    const image = $('profile-settings-avatar-preview');
    const fallback = $('profile-settings-avatar-preview-fallback');
    const removeButton = $('profile-settings-remove-avatar');
    const status = $('profile-settings-identity-message');
    if (!file || !image || !fallback) return;
    if (status) status.textContent = 'Checking image and preparing a preview…';
    try {
      const prepared = await prepareProfileAvatar(file);
      if (profileAvatarPreviewUrl) URL.revokeObjectURL(profileAvatarPreviewUrl);
      profileAvatarPreviewUrl = URL.createObjectURL(prepared.file);
      image.src = profileAvatarPreviewUrl;
      image.hidden = false;
      fallback.hidden = true;
      if (removeButton) removeButton.dataset.clearAvatar = 'false';
      if (status) status.textContent = 'Photo is valid. It will be compressed and stored privately when you save your profile.';
    } catch (error) {
      input.value = '';
      if (status) status.textContent = error?.message || 'Choose a valid JPG, PNG or WebP image up to 20 MB.';
    }
  });

  document.addEventListener('click', function(event) {
    const button = event.target?.closest?.('#profile-settings-remove-avatar');
    if (!button) return;
    event.preventDefault();
    button.dataset.clearAvatar = 'true';
    const input = $('profile-settings-avatar-file');
    if (input) input.value = '';
    if (profileAvatarPreviewUrl) {
      URL.revokeObjectURL(profileAvatarPreviewUrl);
      profileAvatarPreviewUrl = null;
    }
    const image = $('profile-settings-avatar-preview');
    const fallback = $('profile-settings-avatar-preview-fallback');
    if (image) { image.hidden = true; image.removeAttribute('src'); }
    if (fallback) fallback.hidden = false;
    const status = $('profile-settings-identity-message');
    if (status) status.textContent = 'Your picture will be removed when you save your profile.';
  });

  document.addEventListener('submit', async function(event) {
    if (event.target?.id !== 'profile-settings-identity-form') return;
    event.preventDefault();
    const form = event.target;
    const status = $('profile-settings-identity-message');
    const button = $('profile-settings-save-identity');
    const photoInput = $('profile-settings-avatar-file');
    const removeButton = $('profile-settings-remove-avatar');
    const backend = window.CampusShieldBackend;
    let uploadedPath = null;
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      if (!backend?.isConfigured || !currentProfile) throw new Error('Sign in before editing your profile.');
      const user = await backend.getCurrentUser();
      if (!user) throw new Error('Your secure session could not be verified. Sign in again.');
      const displayName = String($('profile-settings-display-name')?.value || '').trim().replace(/\s+/g, ' ');
      if (displayName.length < 2 || displayName.length > 60) throw new Error('Enter a display name between 2 and 60 characters.');
      const file = photoInput?.files?.[0] || null;
      const clearAvatar = !file && removeButton?.dataset.clearAvatar === 'true';
      const oldAvatarPath = currentProfile.avatar_path || null;
      let newAvatarPath = null;

      if (file) {
        const prepared = await prepareProfileAvatar(file);
        if (!window.crypto?.randomUUID) throw new Error('Secure image upload is not supported in this browser. Please update Chrome.');
        uploadedPath = user.id + '/' + window.crypto.randomUUID() + '.webp';
        const { error: uploadError } = await backend.client.storage
          .from('campus-profile-avatars')
          .upload(uploadedPath, prepared.file, { cacheControl: '3600', upsert: false, contentType: 'image/webp' });
        if (uploadError) throw new Error(uploadError.message || 'The photo upload failed. Check your connection and try again.');
        newAvatarPath = uploadedPath;
      }

      const { data: savedProfile, error: saveError } = await backend.client.rpc('update_my_profile_identity', {
        p_display_name: displayName,
        p_avatar_path: newAvatarPath,
        p_clear_avatar: clearAvatar
      });
      if (saveError) throw saveError;
      currentProfile.display_name = savedProfile?.display_name || displayName;
      currentProfile.avatar_path = savedProfile?.avatar_path || null;
      const name = $('profile-settings-name');
      if (name) name.textContent = currentProfile.display_name;
      updateDashboardWelcomeName(currentProfile.display_name);
      await renderProfileAvatar(backend, currentProfile.avatar_path);
      await renderProfileAvatar(backend, currentProfile.avatar_path, 'profile-settings-avatar-preview', 'profile-settings-avatar-preview-fallback');
      await syncDashboardProfileIdentity();
      if (oldAvatarPath && oldAvatarPath !== currentProfile.avatar_path && oldAvatarPath.startsWith(user.id + '/')) {
        await backend.client.storage.from('campus-profile-avatars').remove([oldAvatarPath]).catch(() => {});
      }
      if (photoInput) photoInput.value = '';
      if (profileAvatarPreviewUrl) {
        URL.revokeObjectURL(profileAvatarPreviewUrl);
        profileAvatarPreviewUrl = null;
      }
      if (removeButton) {
        removeButton.dataset.clearAvatar = 'false';
        removeButton.hidden = !currentProfile.avatar_path;
      }
      if (status) status.textContent = 'Your profile name and picture have been saved.';
    } catch (error) {
      if (uploadedPath && backend?.client) {
        await backend.client.storage.from('campus-profile-avatars').remove([uploadedPath]).catch(() => {});
      }
      if (status) status.textContent = error?.message || 'Your profile could not be saved. Please try again.';
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Save profile'; }
    }
  });

  document.addEventListener('submit', async function(event) {
    if (event.target?.id !== 'profile-settings-contact-form') return;
    event.preventDefault();
    const message = $('profile-settings-message');
    const button = $('profile-settings-save-details');
    const backend = window.CampusShieldBackend;
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    if (message) message.textContent = 'Saving your contact details securely…';
    try {
      if (!backend?.isConfigured || !currentProfile) throw new Error('Sign in before updating your contact details.');
      const response = await backend.client.auth.getUser();
      const user = response?.data?.user;
      if (response?.error || !user) throw new Error('Your secure session could not be verified. Please sign in again.');
      const department = String($('profile-settings-department')?.value || '').trim().slice(0, 100);
      const contactPhone = String($('profile-settings-contact-phone')?.value || '').trim().slice(0, 32);
      const metadata = Object.assign({}, user.user_metadata || {}, { department: department, contact_phone: contactPhone });
      const result = await backend.client.auth.updateUser({ data: metadata });
      if (result?.error) throw result.error;
      if (message) message.textContent = 'Your contact details were saved.';
    } catch (error) {
      if (message) message.textContent = error?.message || 'Contact details could not be saved. Please try again.';
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l3 3v13H4V4h1Z"></path><path d="M8 4v6h8V4M8 20v-7h8v7"></path></svg> Save details';
      }
    }
  });

  const CAMPUS_CHAT_CHANNELS = [
    { id: "general", label: "General" },
    { id: "study_help", label: "Study Help" },
    { id: "campus_life", label: "Campus Life" },
    { id: "marketplace", label: "Marketplace" }
  ];
  let campusChatChannel = "general";
  let campusChatUniversityId = null;
  let campusChatSubscription = null;
  let campusChatSubscriptionUniversityId = null;
  let campusChatMessages = [];
  let campusChatLoadGeneration = 0;

  function canModerateCampusChat() {
    return hasVerifiedCampusStaffMembership() &&
      ["admin", "security", "teacher"].includes(currentProfile?.role);
  }

  function stopCampusChatRealtime() {
    const backend = window.CampusShieldBackend;
    const subscription = campusChatSubscription;
    campusChatSubscription = null;
    campusChatSubscriptionUniversityId = null;
    if (backend?.unsubscribeCampusChatMessages && subscription) {
      backend.unsubscribeCampusChatMessages(subscription).catch(function(error) {
        console.warn("Could not close campus chat subscription:", error?.message || error);
      });
    }
  }

  function setCampusChatReady(ready) {
    const input = $("campus-chat-input");
    const send = $("campus-chat-send");
    if (input) input.disabled = !ready;
    if (send) send.disabled = !ready;
  }

  function setCampusChatChannel(channel) {
    if (!CAMPUS_CHAT_CHANNELS.some(function(item) { return item.id === channel; })) return;
    campusChatChannel = channel;
    document.querySelectorAll("[data-chat-channel]").forEach(function(button) {
      const active = button.dataset.chatChannel === channel;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const status = $("campus-chat-status");
    if (status) status.textContent = "Loading " + (CAMPUS_CHAT_CHANNELS.find(function(item) { return item.id === channel; })?.label || "campus") + " chat…";
    refreshCampusChatMessages().catch(function(error) {
      if (status) status.textContent = error?.message || "Campus chat could not be loaded.";
    });
  }

  async function refreshCampusChatMessages(options) {
    const backend = window.CampusShieldBackend;
    const generation = campusChatLoadGeneration;
    if (!backend?.isConfigured || !campusChatUniversityId) return;
    const list = $("campus-chat-messages");
    const status = $("campus-chat-status");
    try {
      const rows = await backend.listCampusChatMessages(campusChatChannel);
      if (generation !== campusChatLoadGeneration || !campusChatUniversityId) return;
      campusChatMessages = Array.isArray(rows) ? rows : [];
      renderCampusChatMessages(campusChatMessages);
      if (status && !(options && options.quiet)) {
        status.textContent = "Showing the latest campus messages. Live updates are enabled when connected.";
      }
    } catch (error) {
      if (list) list.innerHTML = '<div class="campus-chat-empty"><strong>Chat is temporarily unavailable</strong><p>The university chat service may still be getting set up. Refresh this page to retry.</p></div>';
      if (status) status.textContent = error?.message || "Campus chat could not be loaded.";
      throw error;
    }
  }

  function renderCampusChatMessages(rows) {
    const list = $("campus-chat-messages");
    if (!list) return;
    list.replaceChildren();
    if (!Array.isArray(rows) || !rows.length) {
      const empty = document.createElement("div");
      empty.className = "campus-chat-empty";
      const title = document.createElement("strong");
      title.textContent = "No messages here yet";
      const copy = document.createElement("p");
      copy.textContent = "Start the conversation with a helpful question, study tip or campus update.";
      empty.append(title, copy);
      list.appendChild(empty);
      return;
    }
    const myUsername = communityProfile?.username || "";
    rows.forEach(function(row) {
      const card = document.createElement("article");
      card.className = "campus-chat-message" +
        (myUsername && row.author_username === myUsername ? " is-mine" : "") +
        (row.status === "hidden" ? " is-hidden" : "");
      const meta = document.createElement("div");
      meta.className = "campus-chat-message-meta";
      const author = document.createElement("strong");
      author.textContent = "@" + String(row.author_username || "campus_member");
      const time = document.createElement("time");
      time.dateTime = row.created_at || "";
      time.textContent = row.created_at ? dateText(row.created_at) : "Just now";
      meta.append(author, time);
      const body = document.createElement("p");
      body.className = "campus-chat-message-body";
      body.textContent = row.status === "hidden"
        ? "This message has been hidden by campus staff."
        : String(row.body || "");
      card.append(meta, body);

      const actions = document.createElement("div");
      actions.className = "campus-chat-message-actions";
      if (row.status === "published" && myUsername !== row.author_username) {
        const report = document.createElement("button");
        report.type = "button";
        report.textContent = "Report";
        report.setAttribute("aria-label", "Report message from @" + String(row.author_username || "campus member"));
        report.addEventListener("click", function() {
          const dialog = $("campus-chat-report-dialog");
          if (!dialog || typeof dialog.showModal !== "function") {
            toast("Message reporting is not supported by this browser.");
            return;
          }
          $("campus-chat-report-message-id").value = row.id;
          $("campus-chat-report-status").textContent = "";
          $("campus-chat-report-details").value = "";
          dialog.showModal();
        });
        actions.appendChild(report);
      }

      if (canModerateCampusChat()) {
        const moderate = document.createElement("button");
        moderate.type = "button";
        moderate.dataset.action = row.status === "hidden" ? "restore" : "hide";
        moderate.textContent = row.status === "hidden" ? "Restore message" : "Hide message";
        moderate.addEventListener("click", async function() {
          if (row.status !== "hidden" && !window.confirm("Hide this message from students at this university?")) return;
          moderate.disabled = true;
          try {
            await window.CampusShieldBackend.moderateCampusChatMessage(row.id, row.status === "hidden" ? "restore" : "hide");
            await refreshCampusChatMessages({quiet:true});
            await loadCampusChatReports();
            toast(row.status === "hidden" ? "Message restored." : "Message hidden.");
          } catch (error) {
            toast(error?.message || "Could not update this message.");
            moderate.disabled = false;
          }
        });
        actions.appendChild(moderate);
      }
      if (actions.childNodes.length) card.appendChild(actions);
      list.appendChild(card);
    });
    list.scrollTop = list.scrollHeight;
  }

  async function loadCampusChatReports() {
    const panel = $("campus-chat-moderation");
    const list = $("campus-chat-reports-list");
    const status = $("campus-chat-reports-status");
    if (!panel || !list || !status) return;
    const mayModerate = canModerateCampusChat();
    panel.hidden = !mayModerate;
    if (!mayModerate) return;
    status.textContent = "Loading reports…";
    list.replaceChildren();
    try {
      const reports = await window.CampusShieldBackend.listCampusChatReports();
      if (!reports.length) {
        status.textContent = "No pending reports for this university.";
        return;
      }
      status.textContent = reports.length + " pending report" + (reports.length === 1 ? "" : "s") + ".";
      reports.forEach(function(report) {
        const card = document.createElement("article");
        card.className = "campus-chat-report-card";
        const title = document.createElement("strong");
        title.textContent = ({
          spam: "Spam",
          harassment: "Harassment or bullying",
          personal_information: "Personal information",
          threats: "Threats",
          other: "Other concern"
        })[report.reason] || "Chat message report";
        const details = document.createElement("p");
        details.textContent = (report.details || "No extra details provided.") +
          " · Reported " + (report.created_at ? dateText(report.created_at) : "recently");
        const actions = document.createElement("div");
        actions.className = "actions";
        const hide = document.createElement("button");
        hide.type = "button";
        hide.className = "btn danger";
        hide.textContent = "Hide message";
        hide.addEventListener("click", async function() {
          hide.disabled = true;
          try {
            await window.CampusShieldBackend.moderateCampusChatMessage(report.message_id, "hide");
            await window.CampusShieldBackend.reviewCampusChatReport(report.id, "reviewed");
            await refreshCampusChatMessages({quiet:true});
            await loadCampusChatReports();
            toast("Message hidden and report reviewed.");
          } catch (error) { toast(error?.message || "Could not hide this message."); hide.disabled = false; }
        });
        const dismiss = document.createElement("button");
        dismiss.type = "button";
        dismiss.className = "btn secondary";
        dismiss.textContent = "Dismiss report";
        dismiss.addEventListener("click", async function() {
          dismiss.disabled = true;
          try {
            await window.CampusShieldBackend.reviewCampusChatReport(report.id, "dismissed");
            await loadCampusChatReports();
            toast("Report dismissed.");
          } catch (error) { toast(error?.message || "Could not dismiss this report."); dismiss.disabled = false; }
        });
        actions.append(hide, dismiss);
        card.append(title, details, actions);
        list.appendChild(card);
      });
    } catch (error) {
      status.textContent = error?.message || "Could not load chat reports.";
    }
  }

  async function loadCampusChatPage() {
    const backend = window.CampusShieldBackend;
    const status = $("campus-chat-status");
    const list = $("campus-chat-messages");
    if (!backend?.isConfigured || !currentProfile) {
      setCampusChatReady(false);
      if (status) status.textContent = "Sign in to use Campus Chat.";
      return;
    }
    const generation = ++campusChatLoadGeneration;
    setCampusChatReady(false);
    if (status) status.textContent = "Checking your university membership…";
    if (list) list.innerHTML = '<div class="campus-chat-empty"><strong>Loading your campus room…</strong><p>Checking access and loading recent messages.</p></div>';
    try {
      const campus = await backend.getMyCampusContext();
      if (generation !== campusChatLoadGeneration) return;
      campusContext = campus;
      syncCampusAccessNavigation();
      if (!campus?.university_id) {
        stopCampusChatRealtime();
        campusChatUniversityId = null;
        if ($("campus-chat-university")) $("campus-chat-university").textContent = "No university selected";
        if (status) status.textContent = "Choose your university in CampusPulse before joining your campus chat.";
        if (list) list.innerHTML = '<div class="campus-chat-empty"><strong>Your campus room is waiting</strong><p>Choose the correct university to keep conversations separated by campus.</p><button class="btn secondary" type="button" data-page="community">Choose my university</button></div>';
        if ($("campus-chat-moderation")) $("campus-chat-moderation").hidden = true;
        return;
      }
      if ($("campus-chat-university")) {
        $("campus-chat-university").textContent = campus.university_name + (campus.state ? " · " + campus.state : "");
      }
      const verifiedAccess = currentProfile.verification_status === "verified" &&
        campus.membership_status === "active" &&
        campus.verification_status === "verified";
      if (!verifiedAccess) {
        stopCampusChatRealtime();
        campusChatUniversityId = null;
        setCampusChatReady(false);
        if (status) status.textContent = "Campus Chat requires a verified CampusShield account, approved university membership, and student identity approval when required for your account. You can still browse the rest of your workspace.";
        if (list) list.innerHTML = '<div class="campus-chat-empty"><strong>Verification needed</strong><p>Complete account and university verification to join your university conversation.</p></div>';
        if ($("campus-chat-moderation")) $("campus-chat-moderation").hidden = true;
        return;
      }
      const previousUniversity = campusChatUniversityId;
      if (previousUniversity !== campus.university_id) {
        stopCampusChatRealtime();
        campusChatMessages = [];
      }
      campusChatUniversityId = campus.university_id;
      try { communityProfile = await backend.getMyCommunityProfile(); } catch (_) { communityProfile = null; }
      if (generation !== campusChatLoadGeneration) return;
      setCampusChatReady(true);
      if (!campusChatSubscription || campusChatSubscriptionUniversityId !== campus.university_id) {
        campusChatSubscription = backend.subscribeCampusChatMessages(campus.university_id, function(row, eventType) {
          if (row?.university_id !== campusChatUniversityId || row?.channel !== campusChatChannel) return;
          refreshCampusChatMessages({quiet:true}).catch(function() {});
          if (canModerateCampusChat()) loadCampusChatReports();
        }, function(subscriptionStatus) {
          if (generation !== campusChatLoadGeneration || !status) return;
          if (subscriptionStatus === "SUBSCRIBED") {
            status.textContent = "Live chat connected · " + (CAMPUS_CHAT_CHANNELS.find(function(item) { return item.id === campusChatChannel; })?.label || "General");
          } else if (subscriptionStatus === "CHANNEL_ERROR" || subscriptionStatus === "TIMED_OUT") {
            status.textContent = "Live updates are reconnecting. You can still refresh the chat.";
          }
        });
        campusChatSubscriptionUniversityId = campus.university_id;
      }
      await refreshCampusChatMessages();
      await loadCampusChatReports();
    } catch (error) {
      if (generation !== campusChatLoadGeneration) return;
      setCampusChatReady(false);
      if (status) status.textContent = error?.message || "Campus Chat is not available yet.";
      if (list) list.innerHTML = '<div class="campus-chat-empty"><strong>Campus Chat is temporarily unavailable</strong><p>Refresh to retry. If this continues, the chat database migration may not yet be enabled on this environment.</p></div>';
      if ($("campus-chat-moderation")) $("campus-chat-moderation").hidden = true;
    }
  }

  document.querySelectorAll("[data-chat-channel]").forEach(function(button) {
    button.addEventListener("click", function() { setCampusChatChannel(button.dataset.chatChannel); });
  });

  $("campus-chat-form")?.addEventListener("submit", async function(event) {
    event.preventDefault();
    const input = $("campus-chat-input");
    const send = $("campus-chat-send");
    const status = $("campus-chat-status");
    const text = String(input?.value || "").trim();
    if (!text) { input?.focus(); return; }
    if (!campusChatUniversityId) {
      if (status) status.textContent = "Choose a verified university room before sending a message.";
      return;
    }
    if (text.length > 1200) {
      if (status) status.textContent = "Messages must be 1,200 characters or fewer.";
      return;
    }
    if (send) send.disabled = true;
    if (status) status.textContent = "Sending message…";
    try {
      await window.CampusShieldBackend.sendCampusChatMessage(campusChatChannel, text);
      input.value = "";
      await refreshCampusChatMessages({quiet:true});
      if (status) status.textContent = "Message sent.";
      input.focus();
    } catch (error) {
      if (status) status.textContent = error?.message || "Could not send your message.";
    } finally {
      if (send) send.disabled = !campusChatUniversityId;
    }
  });

  $("campus-chat-report-cancel")?.addEventListener("click", function() {
    $("campus-chat-report-dialog")?.close();
  });

  $("campus-chat-report-form")?.addEventListener("submit", async function(event) {
    event.preventDefault();
    const submit = $("campus-chat-report-submit");
    const reportStatus = $("campus-chat-report-status");
    const messageId = $("campus-chat-report-message-id")?.value;
    if (!messageId) return;
    if (submit) submit.disabled = true;
    if (reportStatus) reportStatus.textContent = "Submitting report…";
    try {
      await window.CampusShieldBackend.reportCampusChatMessage(
        messageId,
        $("campus-chat-report-reason").value,
        $("campus-chat-report-details").value
      );
      $("campus-chat-report-dialog")?.close();
      toast("Report sent to your campus moderation team.");
      if (canModerateCampusChat()) await loadCampusChatReports();
    } catch (error) {
      if (reportStatus) reportStatus.textContent = error?.message || "Could not submit report.";
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  $("campus-chat-refresh-reports")?.addEventListener("click", loadCampusChatReports);

  let campusDirectConversations = [];
  let campusDirectActiveId = null;
  let campusDirectActiveConversation = null;
  let campusDirectSelectedRecipient = null;
  let campusDirectSubscription = null;
  let campusDirectSubscriptionId = null;
  let campusDirectLoadGeneration = 0;
  let campusDirectMessageReports = [];

  function stopCampusDirectMessageRealtime() {
    const backend = window.CampusShieldBackend;
    const subscription = campusDirectSubscription;
    campusDirectSubscription = null;
    campusDirectSubscriptionId = null;
    if (backend?.unsubscribeCampusDirectMessages && subscription) {
      backend.unsubscribeCampusDirectMessages(subscription).catch(function(error) {
        console.warn("Could not close private-message subscription:", error?.message || error);
      });
    }
  }

  function setCampusDirectComposer(enabled, hint) {
    const input = $("campus-dm-compose-input");
    const button = $("campus-dm-compose-send");
    if (input) input.disabled = !enabled;
    if (button) button.disabled = !enabled;
    if ($("campus-dm-compose-hint") && hint) $("campus-dm-compose-hint").textContent = hint;
  }

  function campusDirectStatusLabel(conversation) {
    if (!conversation) return "Conversation";
    if (conversation.status === "accepted") return "Connected";
    if (conversation.status === "cancelled") return "Request cancelled";
    if (conversation.status === "blocked") return conversation.blocked_by_me ? "Blocked by you" : "Unavailable";
    if (conversation.status === "declined") return "Request declined";
    return conversation.requested_by_me ? "Request sent" : "Message request";
  }

  async function refreshCampusDirectConversations(options) {
    const backend = window.CampusShieldBackend;
    const list = $("campus-dm-conversations");
    const status = $("campus-dm-inbox-status");
    if (!backend?.isConfigured) return;
    try {
      campusDirectConversations = await backend.listMyCampusDirectConversations();
      renderCampusDirectConversations();
      if (status && !(options && options.quiet)) {
        const incoming = campusDirectConversations.filter(function(item) { return item.status === "pending" && !item.requested_by_me; }).length;
        status.textContent = incoming ? incoming + " message request" + (incoming === 1 ? "" : "s") + " waiting for you." : campusDirectConversations.length + " conversation" + (campusDirectConversations.length === 1 ? "" : "s") + " in your inbox.";
      }
      if (campusDirectActiveId) {
        const selected = campusDirectConversations.find(function(item) { return item.conversation_id === campusDirectActiveId; });
        if (selected) {
          campusDirectActiveConversation = selected;
          renderCampusDirectThreadHeader(selected);
        } else {
          campusDirectActiveId = null;
          campusDirectActiveConversation = null;
          stopCampusDirectMessageRealtime();
          renderCampusDirectThreadEmpty();
        }
      }
    } catch (error) {
      if (status) status.textContent = error?.message || "Could not load your inbox.";
      if (list) list.innerHTML = '<div class="campus-chat-empty"><strong>Inbox unavailable</strong><p>Refresh your private messages to retry.</p></div>';
    }
  }

  function renderCampusDirectConversations() {
    const list = $("campus-dm-conversations");
    if (!list) return;
    list.replaceChildren();
    if (!campusDirectConversations.length) {
      const empty = document.createElement("div");
      empty.className = "campus-chat-empty";
      const title = document.createElement("strong");
      title.textContent = "No conversations yet";
      const copy = document.createElement("p");
      copy.textContent = "Find a campus username above to send a first message.";
      empty.append(title, copy);
      list.appendChild(empty);
      return;
    }
    campusDirectConversations.forEach(function(conversation) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "campus-dm-conversation" + (conversation.conversation_id === campusDirectActiveId ? " active" : "");
      button.setAttribute("aria-pressed", String(conversation.conversation_id === campusDirectActiveId));
      const avatar = document.createElement("span");
      avatar.className = "campus-dm-conversation-avatar";
      avatar.textContent = String(conversation.other_username || "C").replace(/^@/,"").slice(0,1).toUpperCase();
      const copy = document.createElement("span");
      copy.className = "campus-dm-conversation-copy";
      const name = document.createElement("strong");
      name.textContent = "@" + String(conversation.other_username || "campus_member");
      const preview = document.createElement("small");
      preview.textContent = conversation.latest_message_preview || campusDirectStatusLabel(conversation);
      copy.append(name, preview);
      const meta = document.createElement("span");
      meta.className = "campus-dm-conversation-meta";
      const time = document.createElement("time");
      time.textContent = conversation.last_message_at ? dateText(conversation.last_message_at) : "";
      const state = document.createElement("span");
      state.className = "campus-dm-status " + (conversation.status === "pending" ? "pending" : conversation.status === "accepted" ? "accepted" : "");
      state.textContent = campusDirectStatusLabel(conversation);
      meta.append(time, state);
      button.append(avatar, copy, meta);
      button.addEventListener("click", function() { openCampusDirectConversation(conversation.conversation_id); });
      list.appendChild(button);
    });
  }

  function renderCampusDirectThreadEmpty() {
    $("campus-dm-thread-empty").hidden = false;
    $("campus-dm-thread-active").hidden = true;
    setCampusDirectComposer(false, "Only visible to this conversation");
  }

  function renderCampusDirectThreadHeader(conversation) {
    if (!conversation) return renderCampusDirectThreadEmpty();
    $("campus-dm-thread-empty").hidden = true;
    $("campus-dm-thread-active").hidden = false;
    $("campus-dm-thread-avatar").textContent = String(conversation.other_username || "C").replace(/^@/,"").slice(0,1).toUpperCase();
    $("campus-dm-thread-name").textContent = "@" + String(conversation.other_username || "campus_member");
    $("campus-dm-thread-subtitle").textContent = campusDirectStatusLabel(conversation) + " · Same-university chat";
    const pendingIncoming = conversation.status === "pending" && !conversation.requested_by_me;
    const pendingMine = conversation.status === "pending" && conversation.requested_by_me;
    const accepted = conversation.status === "accepted";
    const banner = $("campus-dm-request-banner");
    banner.hidden = !(pendingIncoming || pendingMine);
    if (pendingIncoming) {
      $("campus-dm-request-title").textContent = "Message request";
      $("campus-dm-request-copy").textContent = "Accept to continue the private conversation, or decline this request.";
      $("campus-dm-accept").hidden = false;
      $("campus-dm-decline").hidden = false;
    } else if (pendingMine) {
      $("campus-dm-request-title").textContent = "Request sent";
      $("campus-dm-request-copy").textContent = "You can reply after this member accepts your request.";
      $("campus-dm-accept").hidden = true;
      $("campus-dm-decline").hidden = false;
      $("campus-dm-decline").textContent = "Cancel request";
    } else {
      $("campus-dm-decline").textContent = "Decline";
    }
    $("campus-dm-decline").textContent = pendingMine ? "Cancel request" : "Decline";
    $("campus-dm-block-button").hidden = !(accepted || pendingIncoming || pendingMine);
    $("campus-dm-block-button").textContent = "Block";
    if (accepted) {
      setCampusDirectComposer(true, "Private to you and @" + String(conversation.other_username || "campus_member"));
    } else if (pendingMine) {
      setCampusDirectComposer(false, "Waiting for the member to accept your request");
    } else if (pendingIncoming) {
      setCampusDirectComposer(false, "Accept this request before sending a reply");
    } else if (conversation.status === "blocked") {
      setCampusDirectComposer(false, conversation.blocked_by_me ? "You blocked this conversation" : "This conversation is unavailable");
    } else {
      setCampusDirectComposer(false, "This conversation is closed");
    }
  }

  async function openCampusDirectConversation(conversationId) {
    const conversation = campusDirectConversations.find(function(item) { return item.conversation_id === conversationId; });
    if (!conversation) return;
    campusDirectActiveId = conversationId;
    campusDirectActiveConversation = conversation;
    renderCampusDirectConversations();
    renderCampusDirectThreadHeader(conversation);
    const thread = $("campus-dm-thread-messages");
    const status = $("campus-dm-thread-status");
    thread.replaceChildren();
    const loading = document.createElement("div");
    loading.className = "campus-chat-empty";
    loading.textContent = "Loading private messages…";
    thread.appendChild(loading);
    if (conversation.status !== "accepted" && conversation.status !== "pending") {
      thread.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "campus-dm-thread-empty";
      const copy = document.createElement("p");
      copy.textContent = conversation.status === "blocked"
        ? (conversation.blocked_by_me ? "You blocked this conversation. New messages are disabled." : "This conversation is unavailable. New messages are disabled.")
        : "This message request is closed. Start a new conversation only if it is appropriate and welcome.";
      empty.appendChild(copy);
      thread.appendChild(empty);
      status.textContent = "";
      stopCampusDirectMessageRealtime();
      return;
    }
    try {
      await refreshCampusDirectMessages();
      if (!document.querySelector("#page-campus-messages")?.classList.contains("active") || campusDirectActiveId !== conversationId) return;
      if (campusDirectSubscriptionId !== conversationId) {
        stopCampusDirectMessageRealtime();
        campusDirectSubscription = window.CampusShieldBackend.subscribeCampusDirectMessages(conversationId, function(row) {
          if (row?.conversation_id !== campusDirectActiveId) return;
          refreshCampusDirectMessages({quiet:true}).catch(function() {});
          refreshCampusDirectConversations({quiet:true});
        }, function(subscriptionStatus) {
          if (campusDirectActiveId !== conversationId || !status) return;
          if (subscriptionStatus === "SUBSCRIBED") status.textContent = "Live updates connected.";
          else if (subscriptionStatus === "CHANNEL_ERROR" || subscriptionStatus === "TIMED_OUT") status.textContent = "Live updates are reconnecting; refresh if a new message does not appear.";
        });
        campusDirectSubscriptionId = conversationId;
      }
      await refreshCampusDirectMessageReports();
    } catch (error) {
      if (status) status.textContent = error?.message || "Could not open this private conversation.";
    }
  }

  async function refreshCampusDirectMessages(options) {
    const backend = window.CampusShieldBackend;
    const id = campusDirectActiveId;
    if (!id || !backend?.isConfigured) return;
    const rows = await backend.listCampusDirectMessages(id);
    if (campusDirectActiveId !== id) return;
    const list = $("campus-dm-thread-messages");
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "campus-chat-empty";
      const title = document.createElement("strong");
      title.textContent = "Start the conversation";
      const copy = document.createElement("p");
      copy.textContent = "This private thread is ready for a helpful, respectful exchange.";
      empty.append(title,copy);
      list.appendChild(empty);
    }
    rows.forEach(function(row) {
      const card = document.createElement("article");
      card.className = "campus-dm-message" + (row.is_mine ? " is-mine" : "");
      const head = document.createElement("div");
      head.className = "campus-dm-message-head";
      const author = document.createElement("span");
      author.textContent = "@" + String(row.author_username || "campus_member");
      const time = document.createElement("time");
      time.dateTime = row.created_at || "";
      time.textContent = row.created_at ? dateText(row.created_at) : "Just now";
      head.append(author,time);
      const body = document.createElement("p");
      body.className = "campus-dm-message-body";
      body.textContent = row.body || "";
      card.append(head,body);
      if (!row.is_mine && row.status === "published") {
        const actions = document.createElement("div");
        actions.className = "campus-dm-message-actions";
        const report = document.createElement("button");
        report.type = "button";
        report.textContent = "Report message";
        report.addEventListener("click", function() {
          const dialog = $("campus-dm-report-dialog");
          if (!dialog || typeof dialog.showModal !== "function") {
            toast("Message reporting is not supported by this browser.");
            return;
          }
          $("campus-dm-report-message-id").value = row.id;
          $("campus-dm-report-status").textContent = "";
          $("campus-dm-report-details").value = "";
          dialog.showModal();
        });
        actions.appendChild(report);
        card.appendChild(actions);
      }
      list.appendChild(card);
    });
    if (!(options && options.preserveScroll)) list.scrollTop = list.scrollHeight;
  }

  async function loadCampusDirectMessageReports() {
    const panel = $("campus-dm-moderation");
    const list = $("campus-dm-report-queue");
    const status = $("campus-dm-report-queue-status");
    if (!panel || !list || !status) return;
    panel.hidden = !canModerateCampusChat();
    if (panel.hidden) return;
    status.textContent = "Loading reported private messages…";
    list.replaceChildren();
    try {
      campusDirectMessageReports = await window.CampusShieldBackend.listCampusDirectMessageReports();
      if (!campusDirectMessageReports.length) {
        status.textContent = "No pending private-message reports for this university.";
        return;
      }
      status.textContent = campusDirectMessageReports.length + " pending report" + (campusDirectMessageReports.length === 1 ? "" : "s") + ".";
      campusDirectMessageReports.forEach(function(report) {
        const card = document.createElement("article");
        card.className = "campus-dm-report-card";
        const title = document.createElement("strong");
        title.textContent = "@" + String(report.author_username || "campus_member") + " · " + ({
          spam:"Spam",harassment:"Harassment or bullying",personal_information:"Personal information",threats:"Threats",other:"Other concern"
        })[report.reason];
        const quote = document.createElement("blockquote");
        quote.textContent = report.message_body || "[Message content unavailable]";
        const context = document.createElement("p");
        context.textContent = "Reported by @" + String(report.reporter_username || "campus_member") +
          (report.details ? " · " + report.details : "") +
          " · " + (report.created_at ? dateText(report.created_at) : "Recently");
        const actions = document.createElement("div");
        actions.className = "actions";
        const hide = document.createElement("button");
        hide.type = "button";
        hide.className = "btn danger";
        hide.textContent = "Hide message";
        hide.addEventListener("click", async function() {
          hide.disabled = true;
          try {
            await window.CampusShieldBackend.resolveCampusDirectMessageReport(report.report_id,"hide");
            await loadCampusDirectMessageReports();
            if (campusDirectActiveId === report.conversation_id) await refreshCampusDirectMessages({quiet:true});
            toast("Message hidden and report reviewed.");
          } catch (error) { toast(error?.message || "Could not hide this message."); hide.disabled = false; }
        });
        const dismiss = document.createElement("button");
        dismiss.type = "button";
        dismiss.className = "btn secondary";
        dismiss.textContent = "Dismiss";
        dismiss.addEventListener("click", async function() {
          dismiss.disabled = true;
          try {
            await window.CampusShieldBackend.resolveCampusDirectMessageReport(report.report_id,"dismiss");
            await loadCampusDirectMessageReports();
            toast("Report dismissed.");
          } catch (error) { toast(error?.message || "Could not dismiss this report."); dismiss.disabled = false; }
        });
        actions.append(hide,dismiss);
        card.append(title,quote,context,actions);
        list.appendChild(card);
      });
    } catch (error) {
      status.textContent = error?.message || "Could not load private-message reports.";
    }
  }

  function clearCampusDirectMessageState() {
    campusDirectLoadGeneration++;
    stopCampusDirectMessageRealtime();
    campusDirectConversations = [];
    campusDirectActiveId = null;
    campusDirectActiveConversation = null;
    campusDirectSelectedRecipient = null;
    campusDirectMessageReports = [];
    $("campus-dm-search").value = "";
    $("campus-dm-introduction").value = "";
    $("campus-dm-search-results").replaceChildren();
    $("campus-dm-search-status").textContent = "";
    $("campus-dm-request-form").hidden = true;
    $("campus-dm-search-button").disabled = true;
    $("campus-dm-request-send").disabled = true;
    $("campus-dm-conversations").replaceChildren();
    renderCampusDirectConversations();
    renderCampusDirectThreadEmpty();
    $("campus-dm-thread-messages").replaceChildren();
    $("campus-dm-thread-status").textContent = "";
    $("campus-dm-inbox-status").textContent = "";
    $("campus-dm-moderation").hidden = true;
    $("campus-dm-report-queue").replaceChildren();
    $("campus-dm-report-queue-status").textContent = "";
    $("campus-dm-compose-input").value = "";
    $("campus-dm-report-message-id").value = "";
  }

  async function loadCampusDirectMessagesPage() {
    const backend = window.CampusShieldBackend;
    const status = $("campus-dm-inbox-status");
    if (!backend?.isConfigured || !currentProfile) {
      clearCampusDirectMessageState();
      if (status) status.textContent = "Sign in to use private messages.";
      return;
    }
    const generation = ++campusDirectLoadGeneration;
    if (status) status.textContent = "Checking your university access…";
    try {
      const campus = await backend.getMyCampusContext();
      if (generation !== campusDirectLoadGeneration) return;
      campusContext = campus;
      syncCampusAccessNavigation();
      const verifiedAccess = currentProfile.verification_status === "verified" &&
        campus?.membership_status === "active" &&
        campus?.verification_status === "verified";
      if (!campus?.university_id) {
        clearCampusDirectMessageState();
        status.textContent = "Choose your university in CampusPulse before starting a private conversation.";
        return;
      }
      if (!verifiedAccess) {
        clearCampusDirectMessageState();
        status.textContent = "Private Messages require verified CampusShield access and approved university membership. Student identity approval is also required when your account's access rules call for it.";
        return;
      }
      $("campus-dm-search-button").disabled = false;
      $("campus-dm-request-send").disabled = false;
      const profile = await backend.getMyCommunityProfile();
      communityProfile = profile;
      await refreshCampusDirectConversations();
      await refreshCampusDirectMessageReports();
      if (campusDirectActiveId) {
        const selected = campusDirectConversations.find(function(item) { return item.conversation_id === campusDirectActiveId; });
        if (selected) await openCampusDirectConversation(selected.conversation_id);
      }
    } catch (error) {
      if (generation !== campusDirectLoadGeneration) return;
      if (status) status.textContent = error?.message || "Private Messages are temporarily unavailable.";
    }
  }

  $("campus-dm-search-form")?.addEventListener("submit", async function(event) {
    event.preventDefault();
    const input = $("campus-dm-search");
    const button = $("campus-dm-search-button");
    const status = $("campus-dm-search-status");
    const results = $("campus-dm-search-results");
    const query = String(input?.value || "").trim().toLowerCase();
    if (query.length < 3) {
      if (status) status.textContent = "Enter at least 3 characters of a campus username.";
      return;
    }
    if (button) button.disabled = true;
    if (status) status.textContent = "Searching your university…";
    results.replaceChildren();
    try {
      const members = await window.CampusShieldBackend.searchCampusMembers(query);
      if (!members.length) {
        status.textContent = "No eligible campus members matched that username.";
        return;
      }
      status.textContent = members.length + " member" + (members.length === 1 ? "" : "s") + " found. Choose one to compose a request.";
      members.forEach(function(member) {
        const result = document.createElement("button");
        result.type = "button";
        result.className = "campus-dm-search-result";
        const avatar = document.createElement("span");
        avatar.className = "campus-dm-search-result-avatar";
        avatar.textContent = String(member.username || "C").slice(0,1).toUpperCase();
        const copy = document.createElement("span");
        copy.className = "campus-dm-search-result-copy";
        const name = document.createElement("strong");
        name.textContent = "@" + member.username;
        const sub = document.createElement("small");
        sub.textContent = "Verified university member";
        copy.append(name,sub);
        const arrow = document.createElement("svg");
        arrow.setAttribute("viewBox","0 0 24 24");
        arrow.setAttribute("aria-hidden","true");
        arrow.innerHTML = '<path d="M5 12h14M13 6l6 6-6 6"/>';
        result.append(avatar,copy,arrow);
        result.addEventListener("click", function() {
          campusDirectSelectedRecipient = member.username;
          $("campus-dm-selected-username").textContent = "@" + member.username;
          $("campus-dm-request-form").hidden = false;
          $("campus-dm-introduction").focus();
          status.textContent = "You’re composing a private message request.";
        });
        results.appendChild(result);
      });
    } catch (error) {
      if (status) status.textContent = error?.message || "Could not search for campus members.";
    } finally {
      if (button) button.disabled = false;
    }
  });

  $("campus-dm-clear-selection")?.addEventListener("click", function() {
    campusDirectSelectedRecipient = null;
    $("campus-dm-request-form").hidden = true;
    $("campus-dm-introduction").value = "";
    $("campus-dm-search").focus();
  });

  $("campus-dm-request-form")?.addEventListener("submit", async function(event) {
    event.preventDefault();
    const send = $("campus-dm-request-send");
    const status = $("campus-dm-search-status");
    if (!campusDirectSelectedRecipient) {
      if (status) status.textContent = "Choose a campus member first.";
      return;
    }
    if (send) send.disabled = true;
    if (status) status.textContent = "Sending your message request…";
    try {
      const recipientUsername = campusDirectSelectedRecipient;
      const id = await window.CampusShieldBackend.createCampusDirectMessageRequest(
        recipientUsername,
        $("campus-dm-introduction").value
      );
      $("campus-dm-introduction").value = "";
      $("campus-dm-request-form").hidden = true;
      $("campus-dm-search-results").replaceChildren();
      $("campus-dm-search").value = "";
      campusDirectSelectedRecipient = null;
      await refreshCampusDirectConversations();
      const createdConversation = campusDirectConversations.find(function(item) { return item.conversation_id === id; });
      if (status) status.textContent = createdConversation?.status === "accepted"
        ? "Message sent to @" + recipientUsername + "."
        : "Message request sent. You can continue after the member accepts your request.";
      await openCampusDirectConversation(id);
    } catch (error) {
      if (status) status.textContent = error?.message || "Could not send the message request.";
      await refreshCampusDirectConversations({quiet:true});
    } finally {
      if (send) send.disabled = false;
    }
  });

  $("campus-dm-compose-form")?.addEventListener("submit", async function(event) {
    event.preventDefault();
    const send = $("campus-dm-compose-send");
    const input = $("campus-dm-compose-input");
    const status = $("campus-dm-thread-status");
    const body = String(input?.value || "").trim();
    if (!body || !campusDirectActiveId || campusDirectActiveConversation?.status !== "accepted") return;
    if (send) send.disabled = true;
    if (status) status.textContent = "Sending private message…";
    try {
      await window.CampusShieldBackend.sendCampusDirectMessage(campusDirectActiveId,body);
      input.value = "";
      await refreshCampusDirectMessages();
      await refreshCampusDirectConversations({quiet:true});
      if (status) status.textContent = "Message sent.";
      input.focus();
    } catch (error) {
      if (status) status.textContent = error?.message || "Could not send this private message.";
    } finally {
      if (send) send.disabled = !campusDirectActiveConversation || campusDirectActiveConversation.status !== "accepted";
    }
  });

  $("campus-dm-accept")?.addEventListener("click", async function() {
    if (!campusDirectActiveId) return;
    const status = $("campus-dm-thread-status");
    try {
      await window.CampusShieldBackend.respondCampusDirectMessageRequest(campusDirectActiveId,"accept");
      await refreshCampusDirectConversations({quiet:true});
      await openCampusDirectConversation(campusDirectActiveId);
      if (status) status.textContent = "Request accepted. You can now send private messages.";
    } catch (error) { if (status) status.textContent = error?.message || "Could not accept this request."; }
  });

  $("campus-dm-decline")?.addEventListener("click", async function() {
    if (!campusDirectActiveId) return;
    const conversation = campusDirectActiveConversation;
    const action = conversation?.status === "pending" && conversation.requested_by_me ? "cancel" : "decline";
    if (action === "cancel" && !window.confirm("Cancel your pending message request?")) return;
    try {
      await window.CampusShieldBackend.respondCampusDirectMessageRequest(campusDirectActiveId,action);
      await refreshCampusDirectConversations({quiet:true});
      const selected = campusDirectConversations.find(function(item) { return item.conversation_id === campusDirectActiveId; });
      if (selected) await openCampusDirectConversation(selected.conversation_id);
      toast(action === "cancel" ? "Message request cancelled." : "Message request declined.");
    } catch (error) { $("campus-dm-thread-status").textContent = error?.message || "Could not update this request."; }
  });

  $("campus-dm-block-button")?.addEventListener("click", async function() {
    if (!campusDirectActiveId || !window.confirm("Block this member? You will no longer be able to exchange messages in this conversation.")) return;
    try {
      await window.CampusShieldBackend.respondCampusDirectMessageRequest(campusDirectActiveId,"block");
      stopCampusDirectMessageRealtime();
      await refreshCampusDirectConversations({quiet:true});
      await openCampusDirectConversation(campusDirectActiveId);
    } catch (error) { $("campus-dm-thread-status").textContent = error?.message || "Could not block this member."; }
  });

  $("campus-dm-refresh")?.addEventListener("click", function() {
    refreshCampusDirectConversations().then(function() {
      if (campusDirectActiveId) return refreshCampusDirectMessages();
    }).catch(function(error) { $("campus-dm-inbox-status").textContent = error?.message || "Could not refresh your inbox."; });
  });
  $("campus-dm-refresh-reports")?.addEventListener("click", loadCampusDirectMessageReports);
  $("campus-dm-report-cancel")?.addEventListener("click", function() { $("campus-dm-report-dialog")?.close(); });
  $("campus-dm-report-form")?.addEventListener("submit", async function(event) {
    event.preventDefault();
    const submit = $("campus-dm-report-submit");
    const status = $("campus-dm-report-status");
    const messageId = $("campus-dm-report-message-id")?.value;
    if (!messageId) return;
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Submitting report…";
    try {
      await window.CampusShieldBackend.reportCampusDirectMessage(
        messageId,
        $("campus-dm-report-reason").value,
        $("campus-dm-report-details").value
      );
      $("campus-dm-report-dialog")?.close();
      toast("Private message reported to authorized campus staff.");
      if (canModerateCampusChat()) await loadCampusDirectMessageReports();
    } catch (error) {
      if (status) status.textContent = error?.message || "Could not submit this report.";
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  document.addEventListener('click', e => {
    const button = e.target.closest('[data-page]');
    if (!button) return;
    if (button.tagName === 'A') e.preventDefault();
    if (button.dataset.courseSearch && $('campus-groups-search')) $('campus-groups-search').value = button.dataset.courseSearch;
    navigate(button.dataset.page);
    if (button.dataset.quickAction === 'incident-status') {
      const target = $('recent-reports-panel');
      if (target) target.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
      $('recent-reports-heading')?.focus({preventScroll:true});
    }
    if (button.dataset.page !== 'campus-chat') stopCampusChatRealtime();
    if (button.dataset.page !== 'campus-messages') {
      campusDirectLoadGeneration++;
      stopCampusDirectMessageRealtime();
    }
    if (button.dataset.page === 'campus-chat') loadCampusChatPage();
    if (button.dataset.page === 'campus-messages') loadCampusDirectMessagesPage();
    if (button.dataset.page === 'profile-settings') loadMyProfileSettings();
    if (button.dataset.page === 'campus-contacts') loadCampusContactsPage();
    if (button.dataset.page === 'approvals') loadAccountApprovals();
    if (button.dataset.page === 'identity-verification') loadStudentIdentityStatus();
    if (button.dataset.page === 'classroom') loadCampusClassroomsPage();
    if (button.dataset.page === 'courses') loadCampusCoursesPage();
    if (button.dataset.page === 'opportunities') loadCampusOpportunitiesPage();
    if (button.dataset.page === 'shieldmind') { resetShieldMindForSession(); refreshShieldMindPlan(); window.CampusShieldPlanner?.load(); }
    if (button.dataset.page === 'billing') { refreshShieldMindPlan(); loadInstitutionalBillingRequests(); }
    if (button.dataset.page === 'noticeboard') loadCampusNoticeboardPage();
    if (button.dataset.page === 'helpdesk') loadCampusHelpdeskPage();
    if (button.dataset.page === 'community') loadCommunityPage();
    if (button.hasAttribute('data-lost-found-shortcut')) {
      const postType = $('community-post-type');
      if (postType) postType.value = 'lost_found';
      const composer = $('communityPostForm');
      if (composer) composer.scrollIntoView({behavior: 'smooth', block: 'start'});
      const notice = $('community-post-message');
      if (notice) notice.textContent = 'Lost & Found: share a brief description and general location. Do not post private contact details or sensitive personal information.';
    }
    if (button.dataset.page === 'groups') loadCampusGroupsPage();
    if (button.dataset.page === 'timetable') window.CampusShieldTimetable?.load();
    if (button.dataset.page === 'events') loadCampusEventsPage();
    if (button.dataset.page === 'marketplace') loadCampusMarketplacePage();
    if (button.dataset.page === 'dashboard') loadCampusDashboardInsights();
    if (button.dataset.academicFocus === 'planner') {
      const planner = document.querySelector('#page-shieldmind .shieldmind-planner-panel');
      if (planner) {
        planner.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start'
        });
        $('shieldmind-plan-title')?.focus({ preventScroll: true });
      }
    }
    if (button.dataset.page === 'platform-admin') loadPlatformAdminPage();
  });

  document.addEventListener('click', async function(event) {
    const button = event.target.closest('[data-create-course-community]');
    if (!button) return;
    event.preventDefault();
    const courseId = button.dataset.createCourseCommunity;
    if (!courseId) return;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Creating…';
    const status = $('campus-courses-status');
    try {
      const result = await window.CampusShieldBackend.createCampusCourseGroup(courseId);
      const groupStatus = result?.group_status || 'pending';
      if (status) status.textContent = groupStatus === 'active'
        ? 'Course community is ready. Open it from Campus groups.'
        : 'Course community submitted for campus staff approval.';
      toast(groupStatus === 'active' ? 'Course community ready.' : 'Course community submitted for review.');
      await loadCampusCoursesPage();
    } catch (error) {
      if (status) status.textContent = error?.message || 'Could not create this course community.';
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  async function loadCampusContactsPage() {
    const status = $('campus-contacts-status');
    const campusName = $('campus-contacts-campus-name');
    const officialLink = $('campus-contacts-official-link');
    if (!status || !campusName || !officialLink) return;

    officialLink.hidden = true;
    officialLink.removeAttribute('href');
    campusName.textContent = 'Checking your university…';
    status.textContent = 'Loading the institution directory…';

    try {
      const backend = window.CampusShieldBackend;
      if (!backend?.client) throw new Error('Campus directory is not connected.');

      let context = campusContext;
      if (!context?.university_id) {
        context = await backend.getMyCampusContext();
        campusContext = context;
      }

      if (!context?.university_id) {
        campusName.textContent = 'No university linked';
        status.textContent = 'Link your university in My Profile & Settings. Until then, use your institution’s official channels for current emergency contacts.';
        return;
      }

      const {data, error} = await backend.client
        .from('campus_universities')
        .select('name,official_website')
        .eq('id', context.university_id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;

      campusName.textContent = data?.name || context.university_name || 'Your university';
      const officialUrl = safeHttpUrl(data?.official_website);
      window.CampusShieldServiceDirectory?.selectUniversity(context.university_id);
      if (officialUrl) {
        officialLink.href = officialUrl;
        officialLink.hidden = false;
        status.textContent = 'Institution directory loaded. Confirm emergency numbers and service details on the official university website.';
      } else {
        status.textContent = 'Your university is linked, but an official website is not recorded in the directory yet. No phone numbers will be guessed; check your university portal or contact campus security directly.';
      }
    } catch (error) {
      console.warn('Campus service contacts could not be loaded.');
      campusName.textContent = campusContext?.university_name || 'Your university';
      status.textContent = 'Could not load institution details right now. Use official university channels for verified contacts; this page does not supply unverified emergency numbers.';
    }
  }


  function escapeHubHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function formatHubDate(value) {
    if (!value) return 'No deadline';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date not specified' : date.toLocaleString();
  }

  async function refreshPlatformAdminAccess() {
    const nav = $('platform-admin-nav');
    const backend = window.CampusShieldBackend;
    if (!currentProfile || !backend?.isConfigured) {
      nav.hidden = true;
      $('platform-admin-tools').hidden = true;
      syncNavSectionHeadings();
      return false;
    }
    try {
      const allowed = await backend.isPlatformAdmin();
      nav.hidden = !allowed;
      if (!allowed) {
        $('platform-admin-tools').hidden = true;
        if ($('page-platform-admin').classList.contains('active')) navigate('dashboard');
      }
      syncNavSectionHeadings();
      return allowed;
    } catch (err) {
      console.warn('Could not verify platform administrator access:', err.message);
      nav.hidden = true;
      $('platform-admin-tools').hidden = true;
      syncNavSectionHeadings();
      return false;
    }
  }

  async function loadPlatformAdminPage() {
    const accessMessage = $('platform-admin-access-message');
    const accessPanel = $('platform-admin-access-panel');
    const toolsPanel = $('platform-admin-tools');
    const backend = window.CampusShieldBackend;
    accessPanel.hidden = false;
    toolsPanel.hidden = true;
    accessMessage.textContent = 'Verifying trusted platform administrator access…';
    try {
      if (!backend?.isConfigured || !await backend.isPlatformAdmin()) {
        $('platform-admin-nav').hidden = true;
        syncNavSectionHeadings();
        accessMessage.textContent = 'Access denied. This console is available only to user IDs provisioned by the database owner as trusted platform administrators.';
        return;
      }
      const signedInAdmin = await backend.getCurrentUser();
      const crawlerPanel = $('platform-service-directory-crawler');
      const isCrawlerOwner = String(signedInAdmin?.email || '').toLowerCase() === 'campusshieldaitechnologies@gmail.com';
      const crawlerHost = String(window.location.hostname || '').toLowerCase();
      const isCrawlerEnabledHost = /^campusshield-ai-staging-preview-[a-z0-9-]+\.vercel\.app$/.test(crawlerHost) || /^campusshield-ai-staging-p-git-[a-z0-9-]+\.vercel\.app$/.test(crawlerHost) || crawlerHost === 'campusshield-ai.github.io' || crawlerHost === 'localhost' || crawlerHost === '127.0.0.1';
      if (crawlerPanel) crawlerPanel.hidden = !isCrawlerOwner || !isCrawlerEnabledHost;
      $('platform-admin-nav').hidden = false;
      syncNavSectionHeadings();
      accessPanel.hidden = true;
      toolsPanel.hidden = false;
      await populatePlatformAdminUniversities();
      await Promise.all([loadPlatformUniversityRequests(), loadPlatformAdminCandidates(), loadPlatformCampusAdminRequests()]);
    } catch (err) {
      accessPanel.hidden = false;
      toolsPanel.hidden = true;
      accessMessage.textContent = err.message || 'Could not load the platform administration console.';
    }
  }

  async function populatePlatformAdminUniversities() {
    const select = $('platform-admin-university-select');
    const backend = window.CampusShieldBackend;
    if (!campusUniversitiesCache) campusUniversitiesCache = await backend.listCampusUniversities();
    const oldValue = select.value;
    select.innerHTML = '<option value="">Choose a university</option>' +
      campusUniversitiesCache.map(function(university) {
        return '<option value="' + esc(university.id) + '">' + esc(university.name) + ' · ' + esc(university.state) + '</option>';
      }).join('');
    if (oldValue && campusUniversitiesCache.some(item => item.id === oldValue)) select.value = oldValue;
  }

  async function loadPlatformUniversityRequests() {
    const tbody = $('platform-admin-requests-table');
    const message = $('platform-admin-requests-message');
    tbody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
    message.textContent = 'Loading pending university requests…';
    try {
      const rows = await window.CampusShieldBackend.listPlatformUniversityRequests();
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6">No university listing requests are waiting for review.</td></tr>';
        message.textContent = 'No pending university requests.';
        return;
      }
      tbody.innerHTML = rows.map(function(row) {
        const officialUrl = safeHttpUrl(row.official_website);
        const website = officialUrl
          ? '<a href="' + esc(officialUrl) + '" target="_blank" rel="noopener noreferrer">Open official site</a>'
          : '<span class="muted">Not provided</span>';
        return '<tr>' +
          '<td><strong>' + esc(row.university_name) + '</strong><br><code>' + esc(row.id) + '</code></td>' +
          '<td>' + esc(row.state) + '</td>' +
          '<td>' + esc(row.ownership) + '</td>' +
          '<td>' + website + '</td>' +
          '<td>' + esc(dateText(row.created_at)) + '</td>' +
          '<td><div class="actions">' +
            '<button type="button" class="btn" data-platform-university-review="approve" data-request-id="' + esc(row.id) + '">Approve</button>' +
            '<button type="button" class="btn danger" data-platform-university-review="reject" data-request-id="' + esc(row.id) + '">Reject</button>' +
          '</div></td></tr>';
      }).join('');
      message.textContent = rows.length + ' pending university request(s). Verify details before approving.';
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6">University requests could not be loaded.</td></tr>';
      message.textContent = err.message || 'Could not load university requests.';
    }
  }

  async function loadPlatformCampusAdminRequests() {
    const tbody = $('platform-admin-admin-requests-table');
    const message = $('platform-admin-admin-requests-message');
    tbody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
    try {
      const rows = await window.CampusShieldBackend.listPlatformCampusAdminRequests();
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6">No approved senior-staff requests are waiting for appointment.</td></tr>';
        message.textContent = 'A staff member appears here only after their identity is approved and they request campus administrator consideration.';
        return;
      }
      tbody.innerHTML = rows.map(row =>
        '<tr><td><strong>@' + esc(row.username || 'staff applicant') + '</strong><br><code>' + esc(row.user_id) + '</code></td>' +
        '<td>' + esc(row.university_name) + '</td>' +
        '<td>' + esc(row.position_title) + '</td>' +
        '<td>' + esc(row.official_email || 'Not provided') + '</td>' +
        '<td>' + esc(dateText(row.created_at)) + '</td>' +
        '<td><button type="button" class="btn" data-platform-admin-request-assign="' + esc(row.user_id) + '" data-university-id="' + esc(row.university_id) + '">Appoint campus admin</button></td></tr>'
      ).join('');
      message.textContent = rows.length + ' verified senior-staff request(s). Confirm the appointment with the university before assigning access.';
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6">Requests could not be loaded.</td></tr>';
      message.textContent = err.message || 'Could not load campus administrator requests.';
    }
  }

  $('platform-admin-admin-requests-table').addEventListener('click', async event => {
    const button = event.target.closest('[data-platform-admin-request-assign]');
    if (!button) return;
    if (!confirm('Appoint this verified staff member as campus administrator for the displayed university? This grants university-level controls, not platform-wide access.')) return;
    button.disabled = true;
    try {
      await window.CampusShieldBackend.assignCampusAdmin(button.dataset.platformAdminRequestAssign, button.dataset.universityId);
      $('platform-admin-university-select').value = button.dataset.universityId;
      await Promise.all([loadPlatformCampusAdminRequests(), loadPlatformAdminCandidates()]);
      toast('Campus administrator appointed for that university.');
    } catch (err) {
      toast(err.message || 'Could not appoint campus administrator.');
      button.disabled = false;
    }
  });

  $('platform-admin-refresh-admin-requests').addEventListener('click', loadPlatformCampusAdminRequests);

  async function loadPlatformAdminCandidates() {
    const tbody = $('platform-admin-candidates-table');
    const message = $('platform-admin-candidates-message');
    const universityId = $('platform-admin-university-select').value;
    if (!universityId) {
      tbody.innerHTML = '<tr><td colspan="6">Choose a university above.</td></tr>';
      message.textContent = 'Select a university to load eligible staff.';
      return;
    }
    tbody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
    message.textContent = 'Loading eligible verified staff…';
    try {
      const rows = await window.CampusShieldBackend.listPlatformCampusStaffCandidates(universityId);
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6">No eligible staff were found for this university.</td></tr>';
        message.textContent = 'Only already-verified staff whose membership belongs to this university can be assigned.';
        return;
      }
      tbody.innerHTML = rows.map(function(row) {
        const profile = [row.faculty, row.department].filter(Boolean).map(esc).join(' · ') || 'Not provided';
        return '<tr>' +
          '<td><strong>@' + esc(row.username || 'username unavailable') + '</strong><br><code>' + esc(row.user_id) + '</code></td>' +
          '<td>' + esc(row.account_role || 'Not specified') + '</td>' +
          '<td>' + esc(row.account_status || 'unknown') + '</td>' +
          '<td>' + esc(row.campus_status || 'unknown') + '</td>' +
          '<td>' + profile + '</td>' +
          '<td><button type="button" class="btn" data-platform-assign-admin="' + esc(row.user_id) + '">Assign campus admin</button></td>' +
          '</tr>';
      }).join('');
      message.textContent = rows.length + ' eligible staff account(s). Confirm university membership before assignment.';
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6">Eligible staff could not be loaded.</td></tr>';
      message.textContent = err.message || 'Could not load eligible staff.';
    }
  }

  $('platform-admin-refresh-requests').addEventListener('click', loadPlatformUniversityRequests);
  $('platform-admin-refresh-candidates').addEventListener('click', loadPlatformAdminCandidates);
  $('platform-admin-university-select').addEventListener('change', loadPlatformAdminCandidates);

  async function reviewCrawlerCandidate(page, runId, article, decision) {
    const owner = await window.CampusShieldBackend?.getCurrentUser().catch(() => null);
    if (String(owner?.email || '').toLowerCase() !== 'campusshieldaitechnologies@gmail.com') {
      const state = article.querySelector('[data-candidate-state]');
      if (state) state.textContent = 'Review denied: owner account required.';
      return;
    }
    const confirmText = decision === 'approve'
      ? 'Approve this source into the verified university service directory? Check the official page and contact details first.'
      : 'Reject this candidate? It will stay out of the verified service directory.';
    if (!confirm(confirmText)) return;
    const actions = article.querySelector('.crawler-candidate-actions');
    const state = article.querySelector('[data-candidate-state]');
    const buttons = actions ? Array.from(actions.querySelectorAll('button')) : [];
    buttons.forEach(button => { button.disabled = true; });
    if (state) state.textContent = decision === 'approve' ? 'Rechecking the official page before approval…' : 'Saving rejection…';
    try {
      const client = window.CampusShieldBackend?.client;
      if (!client) throw new Error('CampusShield is not connected to Supabase.');
      const response = await client.functions.invoke('campus-service-directory-crawler', {
        body: { action: 'review_candidate', run_id: runId, university_id: page.university_id, url: page.url, category: page.category, decision: decision }
      });
      const data = response.data;
      const error = response.error;
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Candidate review failed.');
      page.status = data?.candidate?.status || (decision === 'approve' ? 'approved_by_owner' : 'rejected_by_owner');
      if (state) state.textContent = page.status === 'approved_by_owner'
        ? 'APPROVED BY OWNER · Added to verified directory'
        : 'REJECTED BY OWNER · Not added to verified directory';
      if (actions) actions.replaceChildren();
      if (decision === 'approve') window.CampusShieldServiceDirectory?.load?.();
      if (data?.history_update_failed) {
        const warning = document.createElement('p');
        warning.className = 'crawler-candidate-contact';
        warning.textContent = 'The directory was updated, but refresh history to confirm the saved review status.';
        article.appendChild(warning);
      }
    } catch (error) {
      if (state) state.textContent = error?.message || 'Candidate review failed.';
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function renderCrawlerCandidateCard(page, runId) {
    const article = document.createElement('article');
    article.className = 'platform-service-crawler-result';
    const h = document.createElement('h3');
    h.textContent = page.title || page.category || 'Office page';
    const meta = document.createElement('p');
    meta.className = 'status';
    meta.textContent = (page.university_name || 'University') + ' · ' + String(page.category || 'unknown').replaceAll('_', ' ');
    const link = document.createElement('a');
    let safeLink = false;
    try { const parsed = new URL(page.url); safeLink = parsed.protocol === 'https:'; } catch {}
    if (safeLink) {
      link.href = page.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.textContent = page.url || 'Source URL unavailable';
    link.style.overflowWrap = 'anywhere';
    const state = document.createElement('p');
    state.className = 'crawler-candidate-state';
    state.setAttribute('data-candidate-state', 'true');
    const status = String(page.status || 'candidate_requires_review');
    state.textContent = status === 'approved_by_owner' ? 'APPROVED BY OWNER · Added to verified directory'
      : status === 'rejected_by_owner' ? 'REJECTED BY OWNER · Not added to verified directory'
      : 'CANDIDATE · Review the official source before approval';
    article.append(h, meta, link, state);
    const contactParts = [];
    if (page.phone) contactParts.push('Detected phone: ' + page.phone);
    if (page.email) contactParts.push('Detected email: ' + page.email);
    if (contactParts.length) {
      const contact = document.createElement('p');
      contact.className = 'crawler-candidate-contact';
      contact.textContent = contactParts.join(' · ');
      article.appendChild(contact);
    }
    if (status === 'candidate_requires_review') {
      const actions = document.createElement('div');
      actions.className = 'crawler-candidate-actions';
      const approve = document.createElement('button');
      approve.type = 'button';
      approve.className = 'btn';
      approve.textContent = 'Approve source';
      approve.addEventListener('click', () => reviewCrawlerCandidate(page, runId, article, 'approve'));
      const reject = document.createElement('button');
      reject.type = 'button';
      reject.className = 'btn danger';
      reject.textContent = 'Reject';
      reject.addEventListener('click', () => reviewCrawlerCandidate(page, runId, article, 'reject'));
      actions.append(approve, reject);
      article.appendChild(actions);
    }
    return article;
  }

  async function runPlatformServiceDirectoryCrawl(action) {
    const status = $('platform-service-crawler-status');
    const results = $('platform-service-crawler-results');
    const signedInUser = await window.CampusShieldBackend?.getCurrentUser().catch(() => null);
    const crawlerHost = String(window.location.hostname || '').toLowerCase();
    const isCrawlerEnabledHost = /^campusshield-ai-staging-preview-[a-z0-9-]+\.vercel\.app$/.test(crawlerHost) || /^campusshield-ai-staging-p-git-[a-z0-9-]+\.vercel\.app$/.test(crawlerHost) || crawlerHost === 'campusshield-ai.github.io' || crawlerHost === 'localhost' || crawlerHost === '127.0.0.1';
    if (!isCrawlerEnabledHost) { if (status) status.textContent = 'Crawler controls are available only on the authorized staging or production website.'; return; }
    if (String(signedInUser?.email || '').toLowerCase() !== 'campusshieldaitechnologies@gmail.com') {
      if (status) status.textContent = 'This crawler is restricted to its designated owner.';
      return;
    }
    const batchButton = $('platform-service-crawler-batch');
    const oneButton = $('platform-service-crawler-one');
    const select = $('platform-admin-university-select');
    if (!status || !results || !batchButton || !oneButton) return;
    if (action === 'crawl_university' && !select?.value) {
      status.textContent = 'Choose a university in the selector above first.';
      return;
    }
    const client = window.CampusShieldBackend?.client;
    if (!client) { status.textContent = 'CampusShield is not connected to Supabase.'; return; }
    const progressBar = $('platform-service-crawler-progress-bar');
    const progressLabel = $('platform-service-crawler-progress-label');
    const runState = $('platform-service-crawler-run-state');
    const activity = $('platform-service-crawler-activity');
    const pagesMetric = $('platform-crawler-pages');
    const officesMetric = $('platform-crawler-offices');
    const fieldsMetric = $('platform-crawler-fields');
    const resultCount = $('platform-service-crawler-result-count');
    const discoveredUrls = [];
    let pagesSeen = 0;
    const activityLine = (title, detail, done = false, url = '') => {
      const li = document.createElement('li');
      if (done) li.classList.add('done');
      const dot = document.createElement('span'); dot.className = 'crawler-activity-dot';
      const content = document.createElement('div');
      content.appendChild(document.createTextNode(title));
      const small = document.createElement('small'); small.textContent = detail; content.appendChild(small);
      if (url) {
        const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = url; a.className = 'crawler-source-link'; a.style.display = 'block'; a.style.overflowWrap = 'anywhere';
        content.appendChild(a);
      }
      li.append(dot, content); activity?.prepend(li);
    };
    const renderMap = (urls) => {
      const svg = document.querySelector('.crawler-network svg');
      if (!svg) return;
      const ns = 'http://www.w3.org/2000/svg';
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const unique = [...new Set(urls.filter(Boolean))].slice(-10);
      const centerX = 400, centerY = 115;
      const positions = unique.map((url, i) => {
        const angle = (Math.PI * 2 * i / Math.max(unique.length, 1)) - Math.PI / 2;
        return { url, x: centerX + Math.cos(angle) * 240, y: centerY + Math.sin(angle) * 82 };
      });
      const lines = document.createElementNS(ns, 'g'); lines.setAttribute('class','crawler-links');
      positions.forEach(p => { const line=document.createElementNS(ns,'line'); line.setAttribute('x1',centerX);line.setAttribute('y1',centerY);line.setAttribute('x2',p.x);line.setAttribute('y2',p.y);lines.appendChild(line); });
      svg.appendChild(lines);
      const center = document.createElementNS(ns,'circle');center.setAttribute('cx',centerX);center.setAttribute('cy',centerY);center.setAttribute('r','42');center.setAttribute('class','crawler-center');svg.appendChild(center);
      const centerText = document.createElementNS(ns,'text');centerText.setAttribute('x',centerX);centerText.setAttribute('y',111);centerText.setAttribute('class','crawler-svg-text');centerText.textContent='DISCOVERED';svg.appendChild(centerText);
      const centerText2 = document.createElementNS(ns,'text');centerText2.setAttribute('x',centerX);centerText2.setAttribute('y',128);centerText2.setAttribute('class','crawler-svg-text');centerText2.textContent='PAGES';svg.appendChild(centerText2);
      positions.forEach(p => {
        const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r','11');circle.setAttribute('class','crawler-node');svg.appendChild(circle);
        const label=document.createElementNS(ns,'text');label.setAttribute('x',p.x);label.setAttribute('y',p.y+26);label.setAttribute('class','crawler-svg-text');label.setAttribute('font-size','10');
        try { const u=new URL(p.url); label.textContent=(u.pathname==='/'?u.hostname:u.pathname.split('/').filter(Boolean).slice(-1)[0]).slice(0,22); } catch { label.textContent='Page'; }
        svg.appendChild(label);
        circle.setAttribute('tabindex','0');circle.setAttribute('aria-label',p.url);circle.setAttribute('data-url',p.url);
      });
      document.querySelectorAll('.crawler-float').forEach(el=>el.hidden=true);
    };
    const renderResults = (items, activeRunId) => {
      const all = [];
      (Array.isArray(items)?items:[]).forEach(item => (item.discovered_pages||[]).forEach(page => all.push({...page, university_id:item.university_id, university_name:item.university_name})));
      if (resultCount) resultCount.textContent = all.length + ' candidate page(s) · review each source';
      results.replaceChildren();
      if (!all.length) {
        const p=document.createElement('p');p.className='muted';p.textContent='No office-specific candidate pages were returned by this crawl.';results.appendChild(p);return;
      }
      all.forEach(page => results.appendChild(renderCrawlerCandidateCard(page, activeRunId)));
    };
    const loadHistory = async () => {
      const target=$('platform-service-crawler-history'); if(!target)return;
      try {
        const {data,error}=await client.functions.invoke('campus-service-directory-crawler',{body:{action:'crawl_history',limit:10}});
        if(error) throw error; if(data?.error) throw new Error(data.error);
        const runs=Array.isArray(data?.runs)?data.runs:[];
        target.replaceChildren();
        if(!runs.length){const p=document.createElement('p');p.className='muted';p.textContent='No saved crawl runs yet.';target.appendChild(p);return;}
        runs.forEach(run=>{
          const row=document.createElement('article');row.className='platform-service-crawler-result';
          const h=document.createElement('h3');h.textContent=new Date(run.started_at).toLocaleString()+' · '+String(run.status||'unknown').toUpperCase();
          const p=document.createElement('p');p.textContent=(run.action==='crawl_batch'?'Batch crawl':'Selected university')+' · '+Number(run.pages_scanned||0)+' pages · '+Number(run.office_pages_found||0)+' candidates · '+Number(run.fields_populated||0)+' verified fields updated · '+Number(run.failed_or_blocked||0)+' failed/blocked';
          row.append(h,p);target.appendChild(row);
          (Array.isArray(run.results)?run.results:[]).forEach(item=>(item.discovered_pages||[]).forEach(page=>{
            target.appendChild(renderCrawlerCandidateCard({...page,university_id:item.university_id,university_name:item.university_name},run.id));
          }));
        });
      } catch(err) {target.textContent=err?.message||'Crawl history could not be loaded.';}
    };
    batchButton.disabled = true; oneButton.disabled = true;
    results.replaceChildren(); if(activity)activity.replaceChildren();
    if(progressBar)progressBar.style.width='2%'; if(progressLabel)progressLabel.textContent='Starting live crawl…';
    if(runState)runState.textContent='RUNNING';
    if(pagesMetric)pagesMetric.textContent='0'; if(officesMetric)officesMetric.textContent='0'; if(fieldsMetric)fieldsMetric.textContent='0';
    if(resultCount)resultCount.textContent='Waiting for real discoveries';
    activityLine('Owner session checked','Checking authorization again on the server.');
    status.textContent='Connecting to the staging crawler and waiting for actual page events…';
    try {
      const {data:sessionData,error:sessionError}=await client.auth.getSession();
      if(sessionError||!sessionData?.session?.access_token)throw new Error('Please sign in again before running the crawler.');
      const config=window.CAMPUSSHIELD_SUPABASE_CONFIG;
      if(!config?.url||!config?.publishableKey)throw new Error('Supabase browser configuration is unavailable.');
      const body=action==='crawl_batch'?{action:'crawl_batch',batch_size:2,stream:true}:{action:'crawl_university',university_id:select.value,stream:true};
      const response=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/campus-service-directory-crawler',{
        method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+sessionData.session.access_token,'apikey':config.publishableKey,'Accept':'text/event-stream'},body:JSON.stringify(body)
      });
      if(!response.ok) {
        const errBody=await response.json().catch(()=>({}));
        throw new Error(errBody.error||('Crawler request failed ('+response.status+').'));
      }
      if((response.headers.get('content-type')||'').includes('application/json')) {
        const payload=await response.json();
        if(payload?.done) {
          if(progressBar)progressBar.style.width='100%';
          if(progressLabel)progressLabel.textContent='No crawl due';
          if(runState)runState.textContent='IDLE';
          status.textContent=payload.message||'No university websites are due for crawling.';
          activityLine('No crawl performed',status.textContent,true);
          await loadHistory();
          return;
        }
        throw new Error(payload?.error||'The crawler returned JSON instead of a live event stream.');
      }
      if(!response.body)throw new Error('This browser does not support live crawl streaming.');
      const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let completed=false;let runId=null;let finalPayload=null;
      while(true) {
        const {value,done}=await reader.read(); if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        const blocks=buffer.split('\n\n');buffer=blocks.pop()||'';
        for(const block of blocks) {
          const line=block.split('\n').find(l=>l.startsWith('data: '));if(!line)continue;
          let payload;try{payload=JSON.parse(line.slice(6));}catch{continue;}
          if(payload.type==='started') {
            runId=payload.run_id;activityLine('Live crawl started','Run ID: '+runId,true);
            if(progressLabel)progressLabel.textContent='0 pages processed · live events connected';
          } else if(payload.type==='event'&&payload.event) {
            const e=payload.event;const url=e.page_url||'';
            if(url&&['page_fetch_started','page_scanned','office_candidate_found'].includes(e.event_type)){discoveredUrls.push(url);renderMap(discoveredUrls);}
            activityLine(String(e.event_type||'crawl event').replaceAll('_',' '),e.message||'',e.status==='success'||e.status==='allowed',url);
            if(e.event_type==='page_scanned') {
              pagesSeen++;if(pagesMetric)pagesMetric.textContent=String(pagesSeen);
              if(progressLabel)progressLabel.textContent=pagesSeen+' pages scanned · live';
              if(progressBar)progressBar.style.width=Math.min(92,pagesSeen*8)+'%';
            }
          } else if(payload.type==='university_result') {
            const item=payload.result;finalPayload=finalPayload||{results:[]};finalPayload.results.push(item);
          } else if(payload.type==='completed') {
            completed=true;finalPayload=payload;
            if(pagesMetric)pagesMetric.textContent=String(payload.pages_scanned||0);
            if(officesMetric)officesMetric.textContent=String(payload.office_pages_found||0);
            if(fieldsMetric)fieldsMetric.textContent=String(payload.fields_populated||0);
            if(progressBar)progressBar.style.width='100%';
            if(progressLabel)progressLabel.textContent='Completed · '+Number(payload.batch_size||0)+' university site(s)';
            if(runState)runState.textContent=String(payload.status||'completed').toUpperCase();
            status.textContent=payload.message+' '+Number(payload.pages_scanned||0)+' pages scanned, '+Number(payload.office_pages_found||0)+' office pages found, '+Number(payload.fields_populated||0)+' verified fields updated.';
            renderResults(payload.results||[], payload.run_id || runId);
            activityLine('Crawl finished',status.textContent,true);
          } else if(payload.type==='error') {
            throw new Error(payload.message||'The crawl failed.');
          }
        }
      }
      if(!completed)throw new Error('The live stream ended before a completion summary arrived. Check saved crawl history.');
      await loadHistory();
      if(finalPayload?.results?.some(item=>item.populated_fields>0))window.CampusShieldServiceDirectory?.load?.();
    } catch(error) {
      if(progressLabel)progressLabel.textContent='Crawl interrupted or failed';
      if(runState)runState.textContent='ERROR';
      status.textContent=error?.message||'The live crawler could not complete.';
      activityLine('Crawler request failed',status.textContent,true);
    } finally {batchButton.disabled=false;oneButton.disabled=false;}
  }

  $('platform-service-crawler-batch').addEventListener('click', function () {
    runPlatformServiceDirectoryCrawl('crawl_batch');
  });
  $('platform-service-crawler-one').addEventListener('click', function () {
    runPlatformServiceDirectoryCrawl('crawl_university');
  });
  $('platform-service-crawler-history-refresh')?.addEventListener('click', async function () {
    const host = String(window.location.hostname || '').toLowerCase();
    const crawlerEnabledHost = /^campusshield-ai-staging-preview-[a-z0-9-]+\.vercel\.app$/.test(host) || /^campusshield-ai-staging-p-git-[a-z0-9-]+\.vercel\.app$/.test(host) || host === 'campusshield-ai.github.io' || host === 'localhost' || host === '127.0.0.1';
    if (!crawlerEnabledHost) { $('platform-service-crawler-history').textContent = 'Crawler history is available only on the authorized staging or production website.'; return; }
    const user = await window.CampusShieldBackend?.getCurrentUser().catch(() => null);
    if (String(user?.email || '').toLowerCase() !== 'campusshieldaitechnologies@gmail.com') return;
    const client = window.CampusShieldBackend?.client;
    const target = $('platform-service-crawler-history');
    if (!client || !target) return;
    target.textContent = 'Loading crawl history…';
    const { data, error } = await client.functions.invoke('campus-service-directory-crawler', { body: { action: 'crawl_history', limit: 10 } });
    if (error || data?.error) { target.textContent = data?.error || error?.message || 'Could not load crawl history.'; return; }
    target.replaceChildren();
    const runs = Array.isArray(data?.runs) ? data.runs : [];
    if (!runs.length) { target.textContent = 'No saved crawl runs yet.'; return; }
    runs.forEach(run => {
      const article = document.createElement('article'); article.className = 'platform-service-crawler-result';
      const heading = document.createElement('h3'); heading.textContent = new Date(run.started_at).toLocaleString() + ' · ' + String(run.status || 'unknown').toUpperCase();
      const detail = document.createElement('p'); detail.textContent = Number(run.pages_scanned || 0) + ' pages · ' + Number(run.office_pages_found || 0) + ' candidates · ' + Number(run.fields_populated || 0) + ' verified fields updated · ' + Number(run.failed_or_blocked || 0) + ' failed/blocked';
      article.append(heading, detail); target.appendChild(article);
      (Array.isArray(run.results) ? run.results : []).forEach(item => (item.discovered_pages || []).forEach(page => {
        target.appendChild(renderCrawlerCandidateCard({ ...page, university_id: item.university_id, university_name: item.university_name }, run.id));
      }));
    });
  });


  $('platform-admin-requests-table').addEventListener('click', async function(event) {
    const button = event.target.closest('[data-platform-university-review]');
    if (!button) return;
    const decision = button.dataset.platformUniversityReview;
    const requestId = button.dataset.requestId;
    if (!confirm(decision === 'approve'
      ? 'Approve this university and add it to the available campus directory? Verify the official institution details first.'
      : 'Reject this university listing request?')) return;
    button.disabled = true;
    try {
      await window.CampusShieldBackend.reviewPlatformUniversityRequest(requestId, decision);
      if (decision === 'approve') {
        campusUniversitiesCache = null;
        await populatePlatformAdminUniversities();
      }
      toast(decision === 'approve' ? 'University added to the directory.' : 'University request rejected.');
      await loadPlatformUniversityRequests();
      await loadPlatformAdminCandidates();
    } catch (err) {
      button.disabled = false;
      toast(err.message || 'Could not review the university request.');
      $('platform-admin-requests-message').textContent = err.message || 'Could not review the university request.';
    }
  });

  $('platform-admin-candidates-table').addEventListener('click', async function(event) {
    const button = event.target.closest('[data-platform-assign-admin]');
    if (!button) return;
    const userId = button.dataset.platformAssignAdmin;
    const universityId = $('platform-admin-university-select').value;
    if (!confirm('Assign this already-verified staff member as an administrator for the selected university?')) return;
    button.disabled = true;
    try {
      await window.CampusShieldBackend.assignCampusAdmin(userId, universityId);
      toast('Campus administrator assigned.');
      await loadPlatformAdminCandidates();
    } catch (err) {
      button.disabled = false;
      toast(err.message || 'Could not assign campus administrator.');
      $('platform-admin-candidates-message').textContent = err.message || 'Could not assign campus administrator.';
    }
  });

  function render() {
    const total = incidents.length;
    const resolved = incidents.filter(i => isResolvedStatus(i.status)).length;
    const high = incidents.filter(i =>
      normalizeSeverity(i.severity) === 'High' && !isResolvedStatus(i.status)
    ).length;

    $('totalStat').textContent = total;
    $('highStat').textContent = high;
    $('resolvedStat').textContent = resolved;
    $('rateStat').textContent = total ? Math.round(resolved / total * 100) + '%' : '—';

    $('recentList').innerHTML = incidents.slice(0, 5).map(i =>
      `<article class="recent-item">
        <div class="recent-title"><strong>${esc(i.category)}</strong>${tagSeverity(i.severity)}${tagStatus(i.status)}</div>
        <time class="recent-time" datetime="${esc(i.createdAt)}">${esc(dateText(i.createdAt))}</time>
        <p class="recent-description">${esc(i.location)} · ${esc(i.description)}</p>
      </article>`
    ).join('') || `<div class="empty-state"><span class="empty-state-mark" aria-hidden="true">＋</span><div><strong>No reports in view yet</strong><p>Submit a report to start the activity list.</p></div><button class="btn secondary" type="button" data-page="report">Create a report</button></div>`;

    renderTable();
    renderAnalytics();
  }

  function renderTable() {
    const q = ($('searchIncidents').value || '').trim().toLocaleLowerCase();
    const statusFilter = $('statusFilter').value;

    const list = incidents.filter(i =>
      (statusFilter === 'all' ||
        (statusFilter === 'resolved' ? isResolvedStatus(i.status) : !isResolvedStatus(i.status))) &&
      [i.category, i.location, i.description, i.status, i.severity].some(v =>
        String(v || '').toLocaleLowerCase().includes(q)
      )
    );

    $('incidentTable').innerHTML = list.map(i =>
      `<tr>
        <td><strong>${esc(i.category)}</strong><br>${esc(i.description)}</td>
        <td>${esc(i.location)}</td>
        <td>${tagSeverity(i.severity)}</td>
        <td>${tagStatus(i.status)}</td>
        <td>${esc(dateText(i.createdAt))}</td>
        <td>${canManageIncidents() && !isResolvedStatus(i.status)
          ? `<button class="btn secondary" data-resolve="${esc(i.id)}">Resolve</button>`
          : '<span class="muted">—</span>'}</td>
      </tr>`
    ).join('') || '<tr><td colspan="6">No matching incidents.</td></tr>';
    $('incidentResultCount').textContent = `${list.length} ${list.length === 1 ? 'report' : 'reports'}`;
  }

  $('searchIncidents').addEventListener('input', renderTable);
  $('statusFilter').addEventListener('change', renderTable);

  $('refresh-incidents').addEventListener('click', () => {
    refreshIncidentsFromSupabase({quiet:false});
  });

  $('incidentTable').addEventListener('click', async e => {
    const b = e.target.closest('[data-resolve]');
    if (!b) return;

    if (!canManageIncidents()) {
      toast('Only verified security staff or administrators can update incidents.');
      renderTable();
      return;
    }

    try {
      const backend = window.CampusShieldBackend;
      if (!backend?.isConfigured || typeof backend.updateIncidentStatus !== 'function') {
        throw new Error('Incident status updates are not configured.');
      }
      b.disabled = true;
      const updated = await backend.updateIncidentStatus(
        b.dataset.resolve,
        'Resolved'
      );

      incidents = incidents.map(i =>
        i.id === updated.id ? {...i, status:updated.status || 'Resolved'} : i
      );

      render();
      toast('Incident status updated.');
    } catch (err) {
      console.error(err);
      toast('Could not update status: ' + err.message);
    } finally {
      renderTable();
    }
  });

  function renderAnalytics() {
    $('analyticsSummary').textContent =
      `${incidents.length} total incident(s), ` +
      `${incidents.filter(i => normalizeSeverity(i.severity) === 'High').length} high-severity, ` +
      `${incidents.filter(i => isResolvedStatus(i.status)).length} resolved.`;
  }

  async function refreshIncidentsFromSupabase({quiet = true} = {}) {
    const backend = window.CampusShieldBackend;
    const status = $('incidentSyncStatus');
    const refreshButton = $('refresh-incidents');

    if (!backend?.isConfigured) {
      status.textContent = 'Supabase is not connected';
      status.dataset.state = 'error';
      return false;
    }

    if (!currentProfile) {
      status.textContent = 'Sign in to load incident data';
      status.dataset.state = 'idle';
      return false;
    }

    if (incidentRefreshInProgress) {
      incidentRefreshQueued = true;
      return false;
    }

    incidentRefreshInProgress = true;
    const requestSessionVersion = authSessionVersion;
    refreshButton.disabled = true;
    if (!quiet) {
      status.textContent = 'Refreshing incident data…';
      status.dataset.state = 'loading';
    }

    try {
      const rows = await backend.listIncidents();
      if (requestSessionVersion !== authSessionVersion || !currentProfile) return false;

      incidents = rows.map(i => ({
        id:i.id,
        category:i.category,
        severity:normalizeSeverity(i.severity),
        location:i.location,
        description:i.description,
        status:normalizeStatus(i.status),
        createdAt:i.created_at
      }));

      incidentsLastUpdated = new Date();
      status.textContent = `Updated ${incidentsLastUpdated.toLocaleTimeString()}`;
      status.dataset.state = 'ready';
      render();
      if (typeof loadCampusDashboardInsights === 'function') loadCampusDashboardInsights();
      return true;
    } catch (e) {
      if (requestSessionVersion !== authSessionVersion || !currentProfile) return false;
      console.error('Could not refresh incidents:', e);
      status.textContent = incidentsLastUpdated
        ? `Refresh failed · last updated ${incidentsLastUpdated.toLocaleTimeString()}`
        : 'Incident data could not be loaded';
      status.dataset.state = 'error';
      if (!quiet) toast('Could not refresh incident data. Check your connection and account access.');
      return false;
    } finally {
      incidentRefreshInProgress = false;
      refreshButton.disabled = false;
      if (incidentRefreshQueued) {
        incidentRefreshQueued = false;
        window.setTimeout(() => refreshIncidentsFromSupabase({quiet:true}), 0);
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentProfile) {
      refreshIncidentsFromSupabase({quiet:true});
    }
  });

  window.setInterval(() => {
    if (document.visibilityState === 'visible' && currentProfile) {
      refreshIncidentsFromSupabase({quiet:true});
    }
  }, 60000);

  async function loadAccountApprovals() {
    const backend = window.CampusShieldBackend;
    const message = $('approvals-message');
    const tbody = $('approvals-table');
    const nav = $('approvals-nav');

    if (!backend?.isConfigured) {
      message.textContent = 'Supabase is not configured.';
      tbody.innerHTML = '<tr><td colspan="7">Cannot load applications.</td></tr>';
      nav.hidden = true;
      return;
    }

    message.textContent = 'Checking administrator access…';
    tbody.innerHTML = '<tr><td colspan="7">Loading…</td></tr>';

    try {
      const user = await backend.getCurrentUser();

      if (!user) {
        throw new Error('Please sign in with an administrator account.');
      }

      const {data:me, error:meError} = await backend.client
        .from('profiles')
        .select('role, verification_status')
        .eq('id', user.id)
        .single();

      if (meError) throw meError;

      if (me?.role !== 'admin' || me?.verification_status !== 'verified') {
        nav.hidden = true;
        throw new Error('Access denied. A verified administrator account is required.');
      }

      nav.hidden = false;

      const {data:rows, error} = await backend.client
        .from('profiles')
        .select('id, display_name, role, requested_role, verification_status, created_at')
        .in('verification_status', ['pending', 'rejected'])
        .or('requested_role.in.(student,teacher),role.in.(student,teacher)')
        .order('verification_status', {ascending:true})
        .order('created_at', {ascending:true});

      if (error) throw error;

      const studentIds = rows.filter(row => (row.requested_role || row.role) === 'student').map(row => row.id);
      let identityByUser = new Map();
      if (studentIds.length) {
        const {data:identityRows, error:identityError} = await backend.client
          .from('student_identity_verifications')
          .select('user_id, institution_name, student_number, university_id, status, rejection_reason, object_path')
          .in('user_id', studentIds);
        if (identityError) throw identityError;
        identityByUser = new Map((identityRows || []).map(identity => [identity.user_id, identity]));
      }

      if (!rows?.length) {
        tbody.innerHTML = '<tr><td colspan="7">There are no pending or rejected student or teacher applications in this university.</td></tr>';
        message.textContent = 'University administrator access confirmed. No pending or rejected applications.';
        await loadCampusStaffMembershipReviews();
        return;
      }

      tbody.innerHTML = rows.map(row => {
        const identity = identityByUser.get(row.id);
        const isStudent = (row.requested_role || row.role) === 'student';
        const documentCell = identity?.object_path
          ? `<button class="btn secondary" type="button" data-student-document="${esc(identity.object_path)}">Open ID document</button>`
          : '<span class="muted">No document</span>';
        const identityDecision = isStudent && row.verification_status === 'pending'
          ? !identity
            ? '<span class="muted">Waiting for student ID submission.</span><br><button class="btn danger" type="button" data-review="reject" data-user-id="' + esc(row.id) + '">Reject account</button>'
            : identity.status === 'pending'
              ? `<div class="actions"><button class="btn secondary" type="button" data-student-evidence-check data-user-id="${esc(row.id)}">Record ID evidence check</button><button class="btn" type="button" data-identity-review="approve" data-user-id="${esc(row.id)}">Approve ID & account</button><button class="btn danger" type="button" data-identity-review="reject" data-user-id="${esc(row.id)}">Reject ID with reason</button></div>`
              : identity.status === 'rejected'
                ? '<span class="muted">ID rejected; student may resubmit.</span>'
                : `<div class="actions"><button class="btn" type="button" data-review="approve" data-user-id="${esc(row.id)}">Approve account</button><button class="btn danger" type="button" data-review="reject" data-user-id="${esc(row.id)}">Reject account</button></div>`
          : row.verification_status === 'pending'
            ? `<div class="actions"><button class="btn" type="button" data-review="approve" data-user-id="${esc(row.id)}">Approve</button><button class="btn danger" type="button" data-review="reject" data-user-id="${esc(row.id)}">Reject</button></div>`
            : '<span class="muted">Account rejected — view only.</span>';
        return `<tr>
        <td><strong>${esc(row.display_name || 'Name not provided')}</strong></td>
        <td><code>${esc(row.id)}</code></td>
        <td><span class="tag open">${esc(row.requested_role || row.role || 'Not specified')}</span></td>
        <td><span class="tag ${row.verification_status === 'rejected' ? 'high' : 'open'}">${esc(row.verification_status === 'rejected' ? 'Rejected' : 'Pending')}</span></td>
        <td>${esc(dateText(row.created_at))}</td>
        <td>${isStudent ? `<strong>${esc(identity?.institution_name || 'Institution not submitted')}</strong><br><strong>${esc(identity?.student_number || '—')}</strong><br><span class="muted">ID status: ${esc(identity?.status || 'not submitted')}</span>${identity?.rejection_reason ? '<br><span class="muted">Reason: ' + esc(identity.rejection_reason) + '</span>' : ''}<br>${documentCell}` : '—'}</td>
        <td>${identityDecision}
        </td>
      </tr>`;
      }).join('');

      const pendingCount = rows.filter(row => row.verification_status === 'pending').length;
      const rejectedCount = rows.filter(row => row.verification_status === 'rejected').length;
      message.textContent = `${pendingCount} pending and ${rejectedCount} rejected application(s) in this university.`;
      await loadCampusStaffMembershipReviews();
    } catch (err) {
      console.error('Could not load account approvals:', err);
      tbody.innerHTML = '<tr><td colspan="7">Applications could not be loaded.</td></tr>';
      message.textContent = err.message || 'Could not load applications.';
    }
  }

  $('refresh-approvals').addEventListener('click', loadAccountApprovals);

  async function loadCampusStaffMembershipReviews() {
    const panel = $('campus-membership-review-panel');
    const tbody = $('campus-membership-reviews-table');
    const message = $('campus-membership-reviews-message');
    panel.hidden = true;
    tbody.innerHTML = '<tr><td colspan="5">Loading…</td></tr>';
    message.textContent = 'Checking university administrator access…';
    try {
      const rows = await window.CampusShieldBackend.listCampusStaffMembershipReviews();
      panel.hidden = false;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5">No staff membership checks are waiting for review.</td></tr>';
        message.textContent = 'Campus staff membership queue loaded.';
        return;
      }
      tbody.innerHTML = rows.map(function(row) {
        const detail = [row.faculty, row.department].filter(Boolean).map(esc).join(' · ') || 'Not provided';
        return '<tr>' +
          '<td><strong>@' + esc(row.username || 'username unavailable') + '</strong><br><code>' + esc(row.user_id) + '</code></td>' +
          '<td>' + esc(row.requested_role || row.account_role || 'Staff') + '</td>' +
          '<td>' + esc(row.account_status || 'unknown') + '</td>' +
          '<td>' + detail + '</td>' +
          '<td><div class="actions">' +
            '<button class="btn" data-campus-membership-review="approve" data-user-id="' + esc(row.user_id) + '">Verify campus</button>' +
            '<button class="btn danger" data-campus-membership-review="reject" data-user-id="' + esc(row.user_id) + '">Reject</button>' +
          '</div></td></tr>';
      }).join('');
      message.textContent = rows.length + ' staff campus membership check(s) need review.';
    } catch (err) {
      if (currentProfile?.role === 'admin' && currentProfile?.verification_status === 'verified') {
        panel.hidden = false;
        tbody.innerHTML = '<tr><td colspan="5">Campus-specific staff review is unavailable.</td></tr>';
        message.textContent = err.message || 'A verified administrator for this university is required. The initial trusted campus administrator must be initialized first.';
      }
    }
  }

  $('refresh-campus-membership-reviews').addEventListener('click', loadCampusStaffMembershipReviews);

  $('campus-membership-reviews-table').addEventListener('click', async function(event) {
    const button = event.target.closest('[data-campus-membership-review]');
    if (!button) return;
    const decision = button.dataset.campusMembershipReview;
    const userId = button.dataset.userId;
    if (!confirm((decision === 'approve' ? 'Verify this person as a staff member of your university?' : 'Reject this campus staff membership?'))) return;
    button.disabled = true;
    try {
      await window.CampusShieldBackend.reviewCampusStaffMembership(userId, decision);
      toast(decision === 'approve' ? 'Campus staff membership verified.' : 'Campus staff membership rejected.');
      await loadAccountApprovals();
    } catch (err) {
      toast(err.message || 'Could not review campus membership.');
      button.disabled = false;
    }
  });

  $('approvals-table').addEventListener('click', async e => {
    const button = e.target.closest('[data-review]');
    if (!button) return;

    const decision = button.dataset.review;
    const userId = button.dataset.userId;
    const actionLabel = decision === 'approve' ? 'approve' : 'reject';

    if (!confirm(`Are you sure you want to ${actionLabel} this account?`)) return;

    const backend = window.CampusShieldBackend;
    const message = $('approvals-message');

    document.querySelectorAll('#approvals-table button').forEach(b => {
      b.disabled = true;
    });

    message.textContent = `Attempting to ${actionLabel} account…`;

    try {
    const {error} = await backend.client.rpc('review_campus_account', {
        p_user_id: userId,
        p_decision: decision
      });

      if (error) throw error;

      message.textContent =
        `Account ${decision === 'approve' ? 'approved' : 'rejected'} successfully.`;

      toast(`Account ${decision === 'approve' ? 'approved' : 'rejected'}.`);
      await loadAccountApprovals();
    } catch (err) {
      console.error('Account review failed:', err);
      message.textContent = 'Review failed: ' + (err.message || 'Unknown error');
      toast('Could not review account.');

      document.querySelectorAll('#approvals-table button').forEach(b => {
        b.disabled = false;
      });
    }
  });

  async function loadStudentIdentityStatus() {
    const status = $('identity-verification-status');
    const form = $('studentIdentityForm');
    const submit = $('identity-submit');
    $('identity-institution').value = campusContext?.university_name || '';
    const institutionSearch = $('identity-institution-search');
    const institutionOptions = $('identity-university-options');
    institutionSearch.value = campusContext?.university_name || '';
    institutionSearch.setCustomValidity('');
    form.hidden = !identityCompletionMode || !campusContext?.university_id;
    try {
      if (!campusUniversitiesCache) campusUniversitiesCache = await window.CampusShieldBackend.listCampusUniversities();
      institutionOptions.innerHTML = campusUniversitiesCache.map(university =>
        '<option value="' + esc(university.name) + '">' + esc(university.name) + ' · ' + esc(university.state) + ' · ' + esc(university.ownership) + '</option>'
      ).join('');
    } catch (directoryError) {
      console.warn('Could not load the NUC-backed university directory:', directoryError.message);
      $('identity-university-help').textContent = 'Could not load the directory right now. Your already-locked campus remains authoritative; try refreshing before submission.';
    }
    if (!campusContext?.university_id) {
      status.textContent = 'Choose your university in Create account and complete campus onboarding before submitting identity documents.';
      form.hidden = true;
      syncIdentityNavigation();
      return;
    }
    if (!isStudentAccount()) {
      form.hidden = true;
      status.textContent = 'Student identity verification is available to student accounts only.';
      return;
    }
    status.textContent = 'Checking submission status…';
    form.hidden = true;
    try {
      const submission = await window.CampusShieldBackend.getMyStudentIdentityVerification();
      studentIdentitySubmission = submission;
      if (!submission) {
        $('identity-student-number').value = '';
        status.textContent = identityCompletionMode ? 'Submit your student ID card or matriculation document for administrator review.' : 'No student ID submission has been received. Choose Complete student setup to upload it privately.';
        form.hidden = !identityCompletionMode;
        submit.hidden = !identityCompletionMode;
        $('student-identity-setup-button').hidden = false;
        submit.disabled = false;
      } else if (submission.status === 'approved') {
        $('identity-student-number').value = submission.student_number || '';
        const user = await window.CampusShieldBackend.getCurrentUser();
        if (user) {
          const {data:profile, error:profileError} = await window.CampusShieldBackend.client
            .from('profiles')
            .select('role, requested_role, verification_status')
            .eq('id', user.id)
            .single();
          if (!profileError && profile) currentProfile = profile;
        }
        status.textContent = currentProfile?.verification_status === 'verified' ? 'Your student identity is approved. Your student workspace is available.' : 'Your ID has been approved. Your account still follows verified profile and campus permissions.';
        form.hidden = true;
        submit.hidden = true;
        $('student-identity-setup-button').hidden = true;
        syncIdentityNavigation();
        if (identityCompletionMode) closeIdentityCompletionView();
      } else if (submission.status === 'pending') {
        $('identity-student-number').value = submission.student_number || '';
        status.textContent = 'Your ID submission is awaiting administrator review. Your account permissions remain governed by server-side verification.';
        form.hidden = true;
        submit.hidden = true;
        $('student-identity-setup-button').hidden = true;
        submit.disabled = true;
      } else {
        $('identity-student-number').value = submission.student_number || '';
        status.textContent = 'Your ID was rejected. Reason: ' +
          (submission.rejection_reason || 'Please upload a clearer document or contact your campus administrator.') +
          ' Correct the details or choose a clearer file and resubmit.';
        form.hidden = !identityCompletionMode;
        submit.hidden = !identityCompletionMode;
        $('student-identity-setup-button').hidden = false;
        submit.disabled = false;
      }
      syncIdentityNavigation();
    } catch (err) {
      console.error('Could not load student identity status:', err);
      status.textContent = err.message || 'Could not load your identity status. Please refresh and try again.';
      form.hidden = true;
      $('student-identity-setup-button').hidden = false;
    }
  }

  $('identity-institution-search').addEventListener('input', () => {
    const typed = $('identity-institution-search').value.trim().toLocaleLowerCase();
    const locked = String(campusContext?.university_name || '').trim().toLocaleLowerCase();
    const matchesLockedCampus = Boolean(locked) && typed === locked;
    $('identity-institution-search').setCustomValidity(
      matchesLockedCampus ? '' : 'Your university is locked to your campus. Select the exact institution shown for your account; contact support if it is wrong.'
    );
    $('identity-institution').value = campusContext?.university_name || '';
    $('identity-university-help').textContent = matchesLockedCampus
      ? 'Confirmed: this matches your locked campus.'
      : 'Your university is fixed by campus onboarding. Select the exact registered institution; another university cannot be submitted.';
  });

  $('identityUniversityRequestForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('identity-request-university-submit');
    const message = $('identity-request-university-message');
    button.disabled = true;
    message.textContent = 'Sending request for platform review…';
    try {
      await window.CampusShieldBackend.requestCampusUniversity({
        name: $('identity-request-university-name').value.trim(),
        state: $('identity-request-university-state').value.trim(),
        ownership: $('identity-request-university-ownership').value,
        website: $('identity-request-university-website').value.trim()
      });
      $('identityUniversityRequestForm').reset();
      message.textContent = 'University listing request submitted for platform-admin review. Your current campus and identity status have not changed.';
      toast('University listing request submitted.');
    } catch (err) {
      message.textContent = err.message || 'Could not submit the university listing request.';
    } finally {
      button.disabled = false;
    }
  });

  async function submitStudentIdentityDocument() {
    const backend = window.CampusShieldBackend;
    const status = $('identity-verification-status');
    const submit = $('identity-submit');
    try {
      if (!backend?.isConfigured) throw new Error('Supabase is not configured.');
      const user = await backend.getCurrentUser();
      if (!user) throw new Error('Sign in before uploading your student ID document.');
      campusContext = await backend.getMyCampusContext();
      const lockedInstitution = String(campusContext?.university_name || '').trim();
      const typedInstitution = $('identity-institution-search').value.trim();
      const studentNumber = $('identity-student-number').value.trim();
      const file = $('identity-document').files?.[0];
      if (!lockedInstitution || typedInstitution.toLocaleLowerCase() !== lockedInstitution.toLocaleLowerCase()) throw new Error('The university must match your signed-in campus.');
      if (!campusContext?.university_id || studentNumber.length < 2 || studentNumber.length > 80 || !file) throw new Error('Enter a valid student/matric number and choose a JPEG, PNG, or PDF ID document.');
      if (!$('identity-original-document-confirmation').checked) throw new Error('Confirm that this is a genuine university-issued document and has not been AI-generated or digitally altered.');
      submit.disabled = true;
      status.textContent = 'Uploading your document securely…';
      await backend.uploadStudentIdentityDocument(file, { institutionName: lockedInstitution, studentNumber, attestOriginalDocument: $('identity-original-document-confirmation').checked });
      $('identity-document').value = '';
      $('identity-original-document-confirmation').checked = false;
      studentIdentitySubmission = await backend.getMyStudentIdentityVerification();
      status.textContent = 'Identity document submitted for administrator review.';
      identityCompletionMode = false;
      setAuthMode('signin');
      $('workspace').hidden = false;
      $('login-screen').hidden = true;
      await loadStudentIdentityStatus();
      navigate('dashboard');
      await loadCampusDashboardInsights();
    } catch (err) {
      status.textContent = err?.message || 'Submission failed. Please try again.';
      submit.disabled = false;
    }
  }
  $('identity-submit').addEventListener('click', submitStudentIdentityDocument);

  $('identity-request-university-submit').addEventListener('click', async () => {
    const backend = window.CampusShieldBackend;
    const button = $('identity-request-university-submit');
    const message = $('identity-request-university-message');
    try {
      const name = $('identity-request-university-name').value.trim();
      const state = $('identity-request-university-state').value.trim();
      const ownership = $('identity-request-university-ownership').value;
      if (!name || !state || !ownership) {
        message.textContent = 'Enter the official university name, state or FCT, and ownership before submitting the listing request.';
        const missing = !name ? $('identity-request-university-name') : !state ? $('identity-request-university-state') : $('identity-request-university-ownership');
        missing.focus();
        return;
      }
      const user = await backend?.getCurrentUser?.();
      if (!user) { message.textContent = 'Sign in and open Complete student setup before requesting a university listing.'; return; }
      button.disabled = true;
      message.textContent = 'Sending request for platform review…';
      await backend.requestCampusUniversity({
        name,
        state,
        ownership,
        website: $('identity-request-university-website').value.trim()
      });
      ['identity-request-university-name','identity-request-university-state','identity-request-university-ownership','identity-request-university-website'].forEach(id => {
        const field=$(id); if(field.tagName==='SELECT') field.selectedIndex=0; else field.value='';
      });
      message.textContent = 'University listing request submitted for platform-admin review. Your campus assignment remains unchanged.';
      toast('University listing request submitted.');
    } catch (err) {
      message.textContent = err?.message || 'Could not submit the university listing request.';
    } finally { button.disabled = false; }
  });

  $('approvals-table').addEventListener('click', async event => {
    const openButton = event.target.closest('[data-student-document]');
    if (!openButton) return;
    openButton.disabled = true;
    try {
      const url = await window.CampusShieldBackend.createStudentIdentityDocumentUrl(openButton.dataset.studentDocument);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast(err.message || 'Could not open the ID document.');
    } finally {
      openButton.disabled = false;
    }
  });

  $('approvals-table').addEventListener('click', async event => {
    const evidenceButton = event.target.closest('[data-student-evidence-check]');
    if (!evidenceButton) return;
    const userId = evidenceButton.dataset.userId;
    const outcomeChoice = window.prompt('Student ID outcome: 1 = Needs review, 2 = Institution confirmed, 3 = Not confirmed', '1');
    const outcomeMap = { '1': 'needs_review', '2': 'institution_confirmed', '3': 'not_confirmed' };
    const outcome = outcomeMap[String(outcomeChoice || '').trim()];
    if (!outcome) { toast('Choose outcome 1, 2, or 3.'); return; }
    const sourceChoice = window.prompt('Source: 1 = Visual document review, 2 = Official university email, 3 = University registry, 4 = Direct institution contact, 5 = Official payment portal, 6 = Other', '1');
    const sourceMap = { '1': 'document_visual_review', '2': 'official_university_email', '3': 'university_registry', '4': 'direct_institution_contact', '5': 'official_payment_portal', '6': 'other' };
    const sourceKind = sourceMap[String(sourceChoice || '').trim()];
    if (!sourceKind) { toast('Choose source 1–6.'); return; }
    const sourceReference = window.prompt('Source reference (required for institution confirmation; never enter passwords or private secrets):', '') || '';
    if (outcome === 'institution_confirmed' && (!['official_university_email','university_registry','direct_institution_contact','official_payment_portal'].includes(sourceKind) || !sourceReference.trim())) {
      toast('Institution confirmation requires an authoritative source and traceable reference.');
      return;
    }
    const reviewerNote = window.prompt('Reviewer note (optional; do not include unnecessary sensitive information):', '') || '';
    evidenceButton.disabled = true;
    try {
      await window.CampusShieldBackend.recordCampusIdentityEvidenceCheck({
        userId, evidenceType: 'student_id', outcome, sourceKind,
        sourceReference: sourceReference.trim() || null, reviewerNote: reviewerNote.trim() || null
      });
      toast('Student ID evidence check recorded in the campus audit.');
      await loadCampusIdentityEvidenceAudit();
    } catch (err) {
      toast(err.message || 'Could not record student ID evidence check.');
      evidenceButton.disabled = false;
    }
  });

  $('approvals-table').addEventListener('click', async event => {
    const button = event.target.closest('[data-identity-review]');
    if (!button) return;
    const decision = button.dataset.identityReview;
    let rejectionReason = null;
    if (decision === 'reject') {
      rejectionReason = window.prompt('Enter a helpful rejection reason (5–1000 characters). The student can see it and resubmit:', '');
      if (rejectionReason === null) return;
      rejectionReason = rejectionReason.trim();
      if (rejectionReason.length < 5 || rejectionReason.length > 1000) {
        toast('Provide a rejection reason of 5–1000 characters.');
        return;
      }
    } else if (!confirm('Approve this student ID and activate the student account?')) {
      return;
    }
    button.disabled = true;
    try {
      const {error} = await window.CampusShieldBackend.client.rpc('review_student_identity_verification', {
        p_user_id: button.dataset.userId,
        p_decision: decision,
        p_rejection_reason: rejectionReason
      });
      if (error) throw error;
      toast(decision === 'approve'
        ? 'Student identity approved and account activated.'
        : 'ID rejected. The student can correct the document and resubmit.');
      await loadAccountApprovals();
    } catch (err) {
      toast(err.message || 'Could not review student identity.');
      button.disabled = false;
    }
  });

  function canModerateCommunity() {
    return hasVerifiedCampusStaffMembership() &&
      ['admin', 'security', 'teacher'].includes(currentProfile.role);
  }

  function communityPostTypeLabel(type) {
    return ({
      campus_update: 'Campus update',
      question: 'Student question',
      poll: 'Campus poll',
      lost_found: 'Lost and found',
      safety_issue: 'Campus safety issue',
      suggestion: 'Safety improvement suggestion',
      announcement: 'Official staff announcement',
      marketplace_share: 'Marketplace listing'
    })[type] || 'Campus update';
  }

  async function loadCommunityPage() {
    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured || !currentProfile) {
      $('community-feed-status').textContent = 'Sign in to use the campus community.';
      return;
    }
    if (communityLoading) return;
    communityLoading = true;
    $('community-feed-status').textContent = 'Loading your university space…';
    $('community-feed').innerHTML = '<div class="community-empty">Loading campus updates…</div>';

    try {
      const campus = await backend.getMyCampusContext();
      campusContext = campus;
      syncCampusAccessNavigation();
      const needsCampus = !campus?.university_id;
      $('campus-onboarding').hidden = !needsCampus;
      $('community-main-layout').hidden = needsCampus;
      $('community-feed-panel').hidden = needsCampus;
      $('campus-context-banner').hidden = needsCampus;
      $('community-moderation').hidden = needsCampus || !canModerateCommunity();
      if (needsCampus) {
        await populateCampusSelectors();
        $('community-feed-status').textContent = 'Choose your university before using the campus community.';
        $('community-feed').innerHTML = '<div class="community-empty">Your campus space has not been selected yet.</div>';
        $('campus-onboarding-message').textContent = 'Choose your real university. This selection cannot be changed from your account settings.';
        return;
      }
      $('campus-context-name').textContent = campus.university_name + (campus.state ? ' · ' + campus.state : '');
      $('campus-context-status').textContent =
        currentProfile?.verification_status === 'verified' &&
        ['admin','security','teacher'].includes(currentProfile.role) &&
        campus.verification_status !== 'verified'
          ? ' Staff-only actions remain disabled until your membership is verified by this university.'
          : '';
      const profile = await backend.getMyCommunityProfile();
      communityProfile = profile;
      $('community-username-current').textContent = profile?.username ? '@' + profile.username : 'Username unavailable';
      $('community-username').value = profile?.username || '';
      $('community-announcement-option').disabled = !canModerateCommunity();

      const posts = await backend.listCommunityPosts();
      const postIds = posts.map(function(post) { return post.id; });
      const [comments, socialRows, mediaRows] = await Promise.all([
        backend.listCommunityComments(postIds),
        backend.getCommunityPostSocial(postIds),
        backend.listCommunityPostMedia(postIds)
      ]);
      const mediaByPost = Object.create(null);
      (mediaRows || []).forEach(function(item) {
        if (!mediaByPost[item.post_id]) mediaByPost[item.post_id] = [];
        mediaByPost[item.post_id].push(item);
      });
      const pollsByPost = {};
      const pollPosts = posts.filter(function(post) { return post.post_type === 'poll'; }).slice(0, 20);
      const pollResults = await Promise.all(pollPosts.map(async function(post) {
        try { return [post.id, await backend.getCommunityPollData(post.id)]; }
        catch (err) { console.warn('Could not load poll results:', err.message); return [post.id, []]; }
      }));
      pollResults.forEach(function(entry) { pollsByPost[entry[0]] = entry[1]; });
      renderCommunityFeed(posts, comments, socialRows, pollsByPost, mediaByPost);
      $('community-feed-status').textContent = posts.length + (posts.length === 1 ? ' published post' : ' published posts') + ' · refreshed ' + new Date().toLocaleTimeString();

      $('community-moderation').hidden = !canModerateCommunity();
      if (canModerateCommunity()) await loadCommunityModeration();
    } catch (err) {
      console.error('Could not load the community:', err);
      $('community-feed-status').textContent = 'The community could not be loaded. Check the database migration and try refreshing.';
      $('community-feed').innerHTML = '<div class="community-empty">Campus updates are temporarily unavailable.</div>';
      if (canModerateCommunity()) $('community-moderation').hidden = false;
    } finally {
      communityLoading = false;
    }
  }

  function renderCommunityFeed(posts, comments, socialRows, pollsByPost, mediaByPost) {
    const mediaMap = mediaByPost || Object.create(null);
    const list = Array.isArray(posts) ? posts : [];
    const commentList = Array.isArray(comments) ? comments : [];
    const socialByPost = Object.create(null);
    (Array.isArray(socialRows) ? socialRows : []).forEach(function(row) {
      socialByPost[row.post_id] = row;
    });
    const pollMap = pollsByPost || Object.create(null);
    if (!list.length) {
      $('community-feed').innerHTML = '<div class="community-empty"><strong>No published campus updates yet.</strong><p>Start a campus update, ask a question, create a poll or share a safety suggestion. Student posts appear after review.</p></div>';
      return;
    }

    const commentsByPost = Object.create(null);
    commentList.forEach(function(comment) {
      if (!commentsByPost[comment.post_id]) commentsByPost[comment.post_id] = [];
      commentsByPost[comment.post_id].push(comment);
    });

    function renderComment(comment, postId, childrenByParent, depth) {
      const replyButton = depth < 3
        ? '<button type="button" class="btn secondary" data-community-reply="' + esc(comment.id) + '" data-post-id="' + esc(postId) + '">Reply</button>'
        : '';
      const nested = (childrenByParent[comment.id] || []).map(function(child) {
        return renderComment(child, postId, childrenByParent, depth + 1);
      }).join('');
      return '<article class="community-comment" style="margin-left:' + Math.min(depth, 3) * 14 + 'px">' +
        '<div class="community-comment-header"><div class="community-meta"><strong class="community-handle">@' + esc(comment.author_username) + '</strong><span>·</span><time>' + esc(dateText(comment.created_at)) + '</time></div>' +
        '<div class="actions">' + replyButton +
        '<button type="button" class="btn secondary" data-report-community-type="comment" data-report-community-id="' + esc(comment.id) + '">Report</button></div></div>' +
        '<p>' + esc(comment.body) + '</p>' + nested +
        '</article>';
    }

    $('community-feed').innerHTML = list.map(function(post) {
      const postComments = commentsByPost[post.id] || [];
      const childrenByParent = Object.create(null);
      postComments.forEach(function(comment) {
        if (comment.parent_comment_id) {
          if (!childrenByParent[comment.parent_comment_id]) childrenByParent[comment.parent_comment_id] = [];
          childrenByParent[comment.parent_comment_id].push(comment);
        }
      });
      const commentsHtml = postComments.filter(function(comment) {
        return !comment.parent_comment_id;
      }).map(function(comment) {
        return renderComment(comment, post.id, childrenByParent, 0);
      }).join('');
      const social = socialByPost[post.id] || {};
      const reactionCount = Number(social.reaction_count || 0);
      const reacted = Boolean(social.user_reaction);
      const bookmarked = Boolean(social.is_bookmarked);
      const followingAuthor = Boolean(social.following_author);
      const pollOptions = pollMap[post.id] || [];
      const pollHtml = post.post_type === 'poll'
        ? '<section class="community-poll"><strong>Vote in this poll</strong>' +
          (pollOptions.length ? pollOptions.map(function(option) {
            return '<label class="community-poll-option"><input type="radio" name="poll-' + esc(post.id) + '" value="' + esc(option.option_id) + '"' + (option.my_vote ? ' checked' : '') + '> ' +
              esc(option.option_text) + ' <span class="muted">(' + Number(option.vote_count || 0) + ' votes)</span></label>';
          }).join('') : '<p class="muted">Poll choices are unavailable right now.</p>') +
          (pollOptions.length ? '<button type="button" class="btn secondary" data-community-poll-vote="' + esc(post.id) + '">Submit vote</button>' : '') +
          '</section>'
        : '';
      const followButton = !social.is_my_post
        ? '<button type="button" class="btn secondary" data-community-follow="' + esc(post.id) + '" data-follow-state="' + (followingAuthor ? 'following' : 'not_following') + '">' + (followingAuthor ? 'Following author' : 'Follow author') + '</button>'
        : '';

      const mediaHtml = (mediaMap[post.id] || []).map(function(media) {
        if (!media.signed_url) return '';
        const url = esc(media.signed_url);
        const alt = esc(media.alt_text || post.title || 'Campus community attachment');
        if (media.media_kind === 'video') {
          return '<figure><video controls preload="metadata" aria-label="' + alt + '"><source src="' + url + '" type="' + esc(media.mime_type) + '">Your browser cannot play this video.</video>' +
            (media.alt_text ? '<figcaption>' + esc(media.alt_text) + '</figcaption>' : '') + '</figure>';
        }
        return '<figure><img src="' + url + '" alt="' + alt + '" loading="lazy" referrerpolicy="no-referrer">' +
          (media.alt_text ? '<figcaption>' + esc(media.alt_text) + '</figcaption>' : '') + '</figure>';
      }).join('');
      const mediaBlock = mediaHtml ? '<div class="community-media-grid">' + mediaHtml + '</div>' : '';
      return '<article class="community-post" id="community-post-' + esc(post.id) + '">' +
        '<div class="community-post-header"><div class="community-meta">' +
        (post.is_official ? '<span class="community-official">Verified staff update</span>' : '<span class="tag open">' + esc(communityPostTypeLabel(post.post_type)) + '</span>') +
        '<strong class="community-handle">@' + esc(post.author_username) + '</strong><span>·</span><time>' + esc(dateText(post.created_at)) + '</time></div>' +
        '<button type="button" class="btn secondary" data-report-community-type="post" data-report-community-id="' + esc(post.id) + '">Report</button></div>' +
        '<h3 class="community-post-title">' + esc(post.title) + '</h3>' +
        '<p class="community-post-body">' + esc(post.body) + '</p>' + mediaBlock +
        (post.location ? '<p class="community-meta"><span aria-hidden="true">⌖</span> ' + esc(post.location) + '</p>' : '') +
        pollHtml +
        '<div class="community-post-actions">' +
        '<button type="button" class="btn secondary" data-community-reaction="' + esc(post.id) + '" aria-pressed="' + String(reacted) + '">' + (reacted ? 'Liked' : 'Like') + ' (' + reactionCount + ')</button>' +
        '<button type="button" class="btn secondary" data-community-bookmark="' + esc(post.id) + '" aria-pressed="' + String(bookmarked) + '">' + (bookmarked ? 'Saved' : 'Bookmark') + '</button>' +
        '<button type="button" class="btn secondary" data-community-repost="' + esc(post.id) + '">Repost</button>' +
        followButton + '</div>' +
        '<div class="community-comments"><div class="community-meta"><strong>' + postComments.length + (postComments.length === 1 ? ' comment' : ' comments') + '</strong></div>' +
        commentsHtml +
        '<form class="community-comment-form" data-community-comment-form data-post-id="' + esc(post.id) + '">' +
        '<label class="sr-only" for="comment-' + esc(post.id) + '">Write a comment</label>' +
        '<textarea id="comment-' + esc(post.id) + '" name="comment" maxlength="800" required placeholder="Write a helpful, respectful comment…"></textarea>' +
        '<button type="submit" class="btn">Comment</button>' +
        '</form></div></article>';
    }).join('');
  }

  async function loadCommunityModeration() {
    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured || !canModerateCommunity()) return;

    $('community-moderation-message').textContent = 'Loading moderation queue…';
    try {
      const posts = await backend.listCommunityModerationPosts();
      const reports = await backend.listCommunityReports();

      $('community-moderation-posts').innerHTML = posts.length ? posts.map(function(post) {
        return '<article class="community-moderation-item">' +
          '<div class="community-meta"><strong>@' + esc(post.author_username) + '</strong><span>·</span>' + esc(communityPostTypeLabel(post.post_type)) + '<span>·</span>' + esc(dateText(post.created_at)) + '</div>' +
          '<h4>' + esc(post.title) + '</h4><p class="community-post-body">' + esc(post.body) + '</p>' +
          (post.location ? '<p class="community-meta">Location: ' + esc(post.location) + '</p>' : '') +
          '<div class="community-post-actions"><button type="button" class="btn" data-moderate-community-post="publish" data-community-post-id="' + esc(post.id) + '">Publish</button><button type="button" class="btn danger" data-moderate-community-post="reject" data-community-post-id="' + esc(post.id) + '">Reject</button></div></article>';
      }).join('') : '<div class="community-empty">No posts are waiting for review.</div>';

      $('community-reports-queue').innerHTML = reports.length ? reports.map(function(report) {
        const targetId = report.target_type === 'post' ? report.post_id : report.comment_id;
        return '<article class="community-report-item">' +
          '<div class="community-meta"><strong>' + esc(report.target_type === 'post' ? 'Reported post' : 'Reported comment') + '</strong><span>·</span>' + esc(report.reason.replaceAll('_', ' ')) + '<span>·</span>' + esc(dateText(report.created_at)) + '</div>' +
          '<p>' + esc(report.details || 'No extra details provided.') + '</p>' +
          '<p class="community-meta">Content reference: ' + esc(String(targetId || '').slice(0, 12)) + '…</p>' +
          '<div class="community-post-actions"><button type="button" class="btn danger" data-community-report-action="hide" data-community-report-id="' + esc(report.id) + '" data-community-report-type="' + esc(report.target_type) + '" data-community-target-id="' + esc(targetId) + '">Hide content & review</button><button type="button" class="btn secondary" data-community-report-action="dismiss" data-community-report-id="' + esc(report.id) + '">Dismiss report</button></div></article>';
      }).join('') : '<div class="community-empty">No new community reports.</div>';

      $('community-moderation-message').textContent = posts.length + ' post(s) awaiting review · ' + reports.length + ' report(s) to review.';
    } catch (err) {
      console.error('Could not load community moderation:', err);
      $('community-moderation-message').textContent = 'The moderation queue could not be loaded: ' + (err.message || 'unknown error');
      $('community-moderation-posts').innerHTML = '<div class="community-empty">Moderation queue unavailable.</div>';
      $('community-reports-queue').innerHTML = '<div class="community-empty">Report queue unavailable.</div>';
    }
  }


  function campusNoticeAudienceLabel(notice) {
    if (notice.audience_scope === 'department') return 'Department · ' + (notice.target_department || 'selected department');
    if (notice.audience_scope === 'faculty') return 'Faculty · ' + (notice.target_faculty || 'selected faculty');
    return 'Entire university';
  }

  function helpdeskCategoryLabel(value) {
    return ({
      facilities:'Facilities / repairs',
      hostel:'Hostel facilities',
      wifi_it:'Wi-Fi / ICT services',
      classroom_equipment:'Classroom equipment',
      academic_service:'Academic service',
      administration:'Administrative service',
      accessibility:'Accessibility',
      other:'Other service'
    })[value] || 'Campus service';
  }

  function helpdeskStatusLabel(value) {
    return ({
      submitted:'Submitted',
      assigned:'Assigned',
      in_progress:'In progress',
      waiting_student:'Waiting for student',
      resolved:'Resolved',
      closed:'Closed'
    })[value] || 'Submitted';
  }

  function renderHelpdeskTicket(ticket, updates, staffView) {
    const ticketUpdates = (updates || []).filter(function(item) { return item.ticket_id === ticket.id; });
    const timeline = ticketUpdates.length
      ? '<details class="campus-ticket-timeline"><summary>' + ticketUpdates.length + ' progress update(s)</summary>' +
        ticketUpdates.map(function(item) {
          return '<div class="community-comment"><div class="community-meta"><strong>' + esc(item.author_label || 'Campus member') + '</strong><span>·</span><time>' + esc(dateText(item.created_at)) + '</time>' +
            (item.to_status ? '<span class="tag open">' + esc(helpdeskStatusLabel(item.to_status)) + '</span>' : '') +
            '</div><p>' + esc(item.message) + '</p></div>';
        }).join('') + '</details>'
      : '<p class="muted">No progress notes yet.</p>';
    const staffControls = staffView
      ? '<div class="campus-ticket-staff-controls">' +
        '<div class="field"><label for="ticket-status-' + esc(ticket.id) + '">Status</label><select id="ticket-status-' + esc(ticket.id) + '" data-helpdesk-status="' + esc(ticket.id) + '">' +
        ['submitted','assigned','in_progress','waiting_student','resolved','closed'].map(function(status) {
          return '<option value="' + status + '"' + (ticket.status === status ? ' selected' : '') + '>' + esc(helpdeskStatusLabel(status)) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label for="ticket-department-' + esc(ticket.id) + '">Responsible unit</label><input id="ticket-department-' + esc(ticket.id) + '" data-helpdesk-department="' + esc(ticket.id) + '" maxlength="100" value="' + esc(ticket.assigned_department || '') + '" placeholder="e.g. Works Department"></div>' +
        '<div class="field"><label for="ticket-staff-message-' + esc(ticket.id) + '">Progress note (visible to requester)</label><textarea id="ticket-staff-message-' + esc(ticket.id) + '" data-helpdesk-message="' + esc(ticket.id) + '" maxlength="1200" placeholder="Record an action, request more information, or explain the status change."></textarea></div>' +
        '<button type="button" class="btn" data-helpdesk-save="' + esc(ticket.id) + '">Save update</button></div>'
      : '<form class="community-comment-form" data-helpdesk-reply data-ticket-id="' + esc(ticket.id) + '">' +
        '<label class="sr-only" for="ticket-reply-' + esc(ticket.id) + '">Reply to request ' + esc(ticket.reference_code) + '</label>' +
        '<textarea id="ticket-reply-' + esc(ticket.id) + '" name="message" maxlength="1200" minlength="2" placeholder="Add helpful information or reply to a staff update…" required ' + (['resolved','closed'].includes(ticket.status) ? 'disabled' : '') + '></textarea>' +
        '<button type="submit" class="btn secondary" ' + (['resolved','closed'].includes(ticket.status) ? 'disabled' : '') + '>Add update</button></form>';
    const priorityClass = ticket.priority === 'high' ? 'high' : ticket.priority === 'low' ? 'low' : 'medium';
    return '<article class="community-post campus-ticket-card">' +
      '<div class="community-meta"><span class="tag open">' + esc(ticket.reference_code) + '</span><span class="tag ' + priorityClass + '">' + esc(ticket.priority) + ' priority</span><span class="tag ' + (['resolved','closed'].includes(ticket.status) ? 'low' : 'open') + '">' + esc(helpdeskStatusLabel(ticket.status)) + '</span></div>' +
      '<h3 class="community-post-title">' + esc(ticket.title) + '</h3>' +
      '<p class="community-meta">' + esc(helpdeskCategoryLabel(ticket.category)) + ' · Submitted ' + esc(dateText(ticket.created_at)) + '</p>' +
      '<p class="community-post-body">' + esc(ticket.description) + '</p>' +
      (ticket.location ? '<p class="community-meta">Location: ' + esc(ticket.location) + '</p>' : '') +
      '<p class="community-meta">Responsible unit: <strong>' + esc(ticket.assigned_department || 'Not assigned yet') + '</strong>' +
      (staffView ? ' · Requested by @' + esc(ticket.created_by_username || 'campus member') : '') + '</p>' +
      timeline + staffControls + '</article>';
  }

  async function loadCampusHelpdeskPage() {
    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured || !currentProfile) {
      $('campus-helpdesk-my-status').textContent = 'Sign in to submit and track campus service requests.';
      $('campus-helpdesk-my-tickets').innerHTML = '<div class="community-empty">Sign in to continue.</div>';
      return;
    }
    $('campus-helpdesk-my-status').textContent = 'Loading your campus service requests…';
    $('campus-helpdesk-my-tickets').innerHTML = '<div class="community-empty">Loading requests…</div>';
    $('campus-helpdesk-staff-panel').hidden = true;
    try {
      campusContext = await backend.getMyCampusContext();
      if (!campusContext?.university_id) {
        $('campus-helpdesk-my-status').textContent = 'Choose your university before using Helpdesk.';
        $('campus-helpdesk-my-tickets').innerHTML = '<div class="community-empty">Choose your university on CampusPulse first. <button type="button" class="btn secondary" data-page="community">Choose university</button></div>';
        return;
      }
      const user = await backend.getCurrentUser();
      if (!user) throw new Error('Sign in again to continue.');
      const tickets = await backend.listCampusHelpdeskTickets();
      const updates = await backend.listCampusHelpdeskTicketUpdates(tickets.map(function(ticket) { return ticket.id; }));
      const mine = tickets.filter(function(ticket) { return ticket.created_by === user.id; });
      $('campus-helpdesk-my-tickets').innerHTML = mine.length
        ? mine.map(function(ticket) { return renderHelpdeskTicket(ticket, updates, false); }).join('')
        : '<div class="community-empty"><strong>No service requests yet.</strong><p>Report a Wi-Fi, facilities, hostel or other service problem to create your first trackable ticket.</p></div>';
      $('campus-helpdesk-my-status').textContent = mine.length + ' request(s) · refresh to check the latest progress.';
      const staff = canModerateCommunity();
      $('campus-helpdesk-staff-panel').hidden = !staff;
      if (staff) {
        $('campus-helpdesk-staff-status').textContent = tickets.length + ' campus request(s) available to verified staff.';
        $('campus-helpdesk-staff-queue').innerHTML = tickets.length
          ? tickets.map(function(ticket) { return renderHelpdeskTicket(ticket, updates, true); }).join('')
          : '<div class="community-empty">No requests are waiting in this campus queue.</div>';
      }
    } catch (err) {
      console.error('Could not load campus Helpdesk:', err);
      $('campus-helpdesk-my-status').textContent = err.message || 'Campus requests could not be loaded.';
      $('campus-helpdesk-my-tickets').innerHTML = '<div class="community-empty">Helpdesk is temporarily unavailable. Please refresh and try again.</div>';
    }
  }

  async function loadCampusNoticeboardPage() {
    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured || !currentProfile) {
      $('campus-notices-status').textContent = 'Sign in to read official notices for your university.';
      $('campus-noticeboard-feed').innerHTML = '<div class="community-empty">Sign in to continue.</div>';
      $('campus-notice-publisher-panel').hidden = true;
      return;
    }
    $('campus-notices-status').textContent = 'Loading verified campus notices…';
    $('campus-noticeboard-feed').innerHTML = '<div class="community-empty">Loading notices…</div>';
    try {
      campusContext = await backend.getMyCampusContext();
      if (!campusContext?.university_id) {
        $('campus-notices-status').textContent = 'Choose your university before reading campus notices.';
        $('campus-noticeboard-feed').innerHTML = '<div class="community-empty">Choose your university on CampusPulse first. <button type="button" class="btn secondary" data-page="community">Choose university</button></div>';
        $('campus-notice-publisher-panel').hidden = true;
        return;
      }
      const notices = await backend.listCampusNotices();
      const staff = canModerateCommunity();
      $('campus-notice-publisher-panel').hidden = !staff;
      $('campus-noticeboard-feed').innerHTML = notices.length
        ? notices.map(function(notice) {
            const expiry = notice.expires_at ? '<p class="community-meta">Expires ' + esc(dateText(notice.expires_at)) + '</p>' : '';
            const archiveButton = staff ? '<button type="button" class="btn secondary" data-archive-campus-notice="' + esc(notice.id) + '">Archive notice</button>' : '';
            return '<article class="community-post campus-notice-card">' +
              '<div class="community-meta"><span class="community-official">Verified campus notice</span><span class="tag open">' + esc(String(notice.category || 'announcement').replaceAll('_',' ')) + '</span><time>' + esc(dateText(notice.published_at)) + '</time></div>' +
              '<h3 class="community-post-title">' + esc(notice.title) + '</h3>' +
              '<p class="community-post-body">' + esc(notice.body) + '</p>' +
              '<p class="community-meta">Published by <strong>' + esc(notice.publisher_label) + '</strong> · ' + esc(campusNoticeAudienceLabel(notice)) + '</p>' + expiry +
              (archiveButton ? '<div class="community-post-actions">' + archiveButton + '</div>' : '') +
              '</article>';
          }).join('')
        : '<div class="community-empty"><strong>No active official notices.</strong><p>Check back for verified academic dates, registration deadlines and campus service updates.</p></div>';
      $('campus-notices-status').textContent = notices.length + ' active notice(s) visible to your campus account.';
    } catch (err) {
      console.error('Could not load campus noticeboard:', err);
      $('campus-notices-status').textContent = err.message || 'Official notices could not be loaded.';
      $('campus-noticeboard-feed').innerHTML = '<div class="community-empty">The noticeboard is temporarily unavailable.</div>';
      $('campus-notice-publisher-panel').hidden = true;
    }
  }

  function syncCampusNoticeAudienceFields() {
    const scope = $('campus-notice-audience').value;
    $('campus-notice-faculty-wrap').hidden = scope === 'campus';
    $('campus-notice-department-wrap').hidden = scope !== 'department';
    $('campus-notice-faculty').required = scope !== 'campus';
    $('campus-notice-department').required = scope === 'department';
  }
  $('campus-notice-audience').addEventListener('change', syncCampusNoticeAudienceFields);
  syncCampusNoticeAudienceFields();

  $('campusHelpdeskForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const button = $('campus-helpdesk-submit');
    const message = $('campus-helpdesk-submit-message');
    if (!window.CampusShieldBackend?.isConfigured) {
      message.textContent = 'Supabase is not configured.';
      return;
    }
    button.disabled = true;
    message.textContent = 'Submitting request and creating reference number…';
    try {
      const ticket = await window.CampusShieldBackend.submitCampusHelpdeskTicket({
        category: $('campus-helpdesk-category').value,
        title: $('campus-helpdesk-title').value.trim(),
        location: $('campus-helpdesk-location').value.trim(),
        priority: $('campus-helpdesk-priority').value,
        description: $('campus-helpdesk-description').value.trim()
      });
      $('campusHelpdeskForm').reset();
      message.textContent = 'Request submitted. Your reference is ' + (ticket?.reference_code || 'created') + '.';
      toast('Campus service request submitted.');
      await loadCampusHelpdeskPage();
    } catch (err) {
      message.textContent = err.message || 'Could not submit the campus request.';
    } finally {
      button.disabled = false;
    }
  });

  $('campus-helpdesk-my-tickets').addEventListener('submit', async function(event) {
    const form = event.target.closest('[data-helpdesk-reply]');
    if (!form) return;
    event.preventDefault();
    const textarea = form.querySelector('textarea[name="message"]');
    const button = form.querySelector('button[type="submit"]');
    const message = textarea.value.trim();
    if (message.length < 2 || message.length > 1200) {
      toast('A reply must be 2–1200 characters.');
      return;
    }
    button.disabled = true;
    try {
      await window.CampusShieldBackend.updateCampusHelpdeskTicket(form.dataset.ticketId, null, null, message);
      toast('Request update added.');
      await loadCampusHelpdeskPage();
    } catch (err) {
      toast(err.message || 'Could not add your request update.');
      button.disabled = false;
    }
  });

  $('campus-helpdesk-staff-queue').addEventListener('click', async function(event) {
    const button = event.target.closest('[data-helpdesk-save]');
    if (!button) return;
    const ticketId = button.dataset.helpdeskSave;
    const status = $('campus-helpdesk-staff-queue').querySelector('[data-helpdesk-status="' + CSS.escape(ticketId) + '"]');
    const department = $('campus-helpdesk-staff-queue').querySelector('[data-helpdesk-department="' + CSS.escape(ticketId) + '"]');
    const note = $('campus-helpdesk-staff-queue').querySelector('[data-helpdesk-message="' + CSS.escape(ticketId) + '"]');
    button.disabled = true;
    try {
      await window.CampusShieldBackend.updateCampusHelpdeskTicket(ticketId, status?.value || null, department?.value ?? null, note?.value || null);
      toast('Helpdesk request updated.');
      await loadCampusHelpdeskPage();
    } catch (err) {
      toast(err.message || 'Could not update the Helpdesk request.');
      button.disabled = false;
    }
  });

  $('campusNoticeForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const button = $('campus-notice-submit');
    const message = $('campus-notice-publisher-message');
    if (!window.CampusShieldBackend?.isConfigured) {
      message.textContent = 'Supabase is not configured.';
      return;
    }
    button.disabled = true;
    message.textContent = 'Publishing official notice…';
    try {
      const expiryValue = $('campus-notice-expires').value;
      await window.CampusShieldBackend.publishCampusNotice({
        publisherLabel: $('campus-notice-publisher').value.trim(),
        title: $('campus-notice-title').value.trim(),
        body: $('campus-notice-body').value.trim(),
        category: $('campus-notice-category').value,
        audienceScope: $('campus-notice-audience').value,
        targetFaculty: $('campus-notice-audience').value === 'campus' ? null : $('campus-notice-faculty').value.trim(),
        targetDepartment: $('campus-notice-audience').value === 'department' ? $('campus-notice-department').value.trim() : null,
        expiresAt: expiryValue ? new Date(expiryValue).toISOString() : null
      });
      $('campusNoticeForm').reset();
      syncCampusNoticeAudienceFields();
      message.textContent = 'Official notice published. It is visible only to its selected campus audience.';
      toast('Official notice published.');
      await loadCampusNoticeboardPage();
    } catch (err) {
      message.textContent = err.message || 'Could not publish this notice.';
    } finally {
      button.disabled = false;
    }
  });

  $('campus-noticeboard-feed').addEventListener('click', async function(event) {
    const button = event.target.closest('[data-archive-campus-notice]');
    if (!button) return;
    if (!confirm('Archive this official notice? It will no longer appear in the active student noticeboard.')) return;
    button.disabled = true;
    try {
      await window.CampusShieldBackend.archiveCampusNotice(button.dataset.archiveCampusNotice);
      toast('Notice archived.');
      await loadCampusNoticeboardPage();
    } catch (err) {
      toast(err.message || 'Could not archive the notice.');
      button.disabled = false;
    }
  });

  $('refresh-campus-helpdesk').addEventListener('click', loadCampusHelpdeskPage);
  let campusGroupsSearchTimer = null;
  $('campus-groups-search')?.addEventListener('input', function() {
    if (campusGroupsSearchTimer !== null) window.clearTimeout(campusGroupsSearchTimer);
    campusGroupsSearchTimer = window.setTimeout(loadCampusGroupsPage, 250);
  });


  $('refresh-campus-notices').addEventListener('click', loadCampusNoticeboardPage);

  async function loadCampusGroupsPage() {
    const backend = window.CampusShieldBackend;
    const status = $('campus-groups-status');
    if (!currentProfile || !backend?.isConfigured) return;
    status.textContent = 'Loading your university groups…';
    try {
      campusContext = await backend.getMyCampusContext();
      if (!campusContext?.university_id) {
        status.textContent = 'Choose your university on the Campus community page first.';
        $('campus-groups-feed').innerHTML = '';
        return;
      }
      const [groups, joined] = await Promise.all([
        backend.listCampusGroups(),
        backend.listMyCampusGroupMemberships()
      ]);
      const memberIds = new Set(joined);
      const groupQuery = String($('campus-groups-search')?.value || '').trim().toLowerCase();
      const visibleGroups = groups.filter(function(group) {
        return !groupQuery || [group.name,group.description,group.group_type].some(function(value) {
          return String(value || '').toLowerCase().includes(groupQuery);
        });
      });
      $('campus-groups-feed').innerHTML = visibleGroups.length ? visibleGroups.map(function(group) {
        const isJoined = memberIds.has(group.id);
        return '<article class="community-post">' +
          '<div class="community-meta"><span class="tag open">' + esc(group.group_type.replaceAll('_',' ')) + '</span><span>·</span><strong>' + esc(group.course_id ? 'Course community' : (group.privacy === 'request_to_join' ? 'Request to join' : 'Campus group')) + '</strong></div>' +
          '<h3 class="community-post-title">' + esc(group.name) + '</h3>' +
          '<p class="community-post-body">' + esc(group.description || 'Campus group') + '</p>' +
          '<p class="community-meta">Created by @' + esc(group.creator_username || 'campus member') + '</p>' +
          '<div class="actions campus-group-card-actions"><button type="button" class="btn ' + (isJoined ? 'secondary' : '') + '" data-campus-group-action="' + (isJoined ? 'leave' : 'join') + '" data-campus-group-id="' + esc(group.id) + '">' + (isJoined ? 'Leave group' : 'Join group') + '</button>' +
          (group.course_id && isJoined ? '<button type="button" class="btn" data-open-course-discussion data-course-group-id="' + esc(group.id) + '" data-course-group-name="' + esc(group.name) + '">Open discussion</button>' : '') + '</div>' +
          '</article>';
      }).join('') : '<div class="community-empty"><strong>No approved groups yet.</strong><p>Create one for your course, department, study circle or society. It will be reviewed before appearing.</p></div>';
      status.textContent = visibleGroups.length + ' group(s) match your search.';
      if (canModerateCommunity()) await loadCampusContentModeration();
    } catch (err) {
      status.textContent = err.message || 'Could not load campus groups.';
      $('campus-groups-feed').innerHTML = '<div class="community-empty">Campus groups are temporarily unavailable.</div>';
    }
  }

  async function loadCampusEventsPage() {
    const backend = window.CampusShieldBackend;
    const status = $('campus-events-status');
    if (!currentProfile || !backend?.isConfigured) return;
    status.textContent = 'Loading campus events…';
    try {
      campusContext = await backend.getMyCampusContext();
      if (!campusContext?.university_id) {
        status.textContent = 'Choose your university on the Campus community page first.';
        $('campus-events-feed').innerHTML = '';
        return;
      }
      const [events, responses] = await Promise.all([
        backend.listCampusEvents(),
        backend.listMyCampusEventRsvps()
      ]);
      const rsvpByEvent = Object.create(null);
      responses.forEach(row => { rsvpByEvent[row.event_id] = row.response; });      $('campus-events-feed').innerHTML = events.length ? events.map(function(event) {
        const current = rsvpByEvent[event.id] || '';
        return '<article class="community-post">' +
          '<div class="community-meta"><span class="tag open">' + esc(event.category.replaceAll('_',' ')) + '</span><span>·</span><time>' + esc(dateText(event.starts_at)) + '</time></div>' +
          '<h3 class="community-post-title">' + esc(event.title) + '</h3>' +
          '<p class="community-post-body">' + esc(event.description || '') + '</p>' +
          '<p class="community-meta">Location: ' + esc(event.location || 'See organizer details') + (event.organizer_username ? ' · Organizer @' + esc(event.organizer_username) : '') + '</p>' +
          (event.ends_at ? '<p class="community-meta">Ends: ' + esc(dateText(event.ends_at)) + '</p>' : '') +
          '<div class="actions"><button type="button" class="btn ' + (current === 'going' ? 'secondary' : '') + '" data-campus-event-rsvp="going" data-campus-event-id="' + esc(event.id) + '">' + (current === 'going' ? 'Going ✓' : 'I’m going') + '</button>' +
          '<button type="button" class="btn secondary" data-campus-event-rsvp="interested" data-campus-event-id="' + esc(event.id) + '">' + (current === 'interested' ? 'Interested ✓' : 'Interested') + '</button></div>' +
          '</article>';
      }).join('') : '<div class="community-empty"><strong>No upcoming approved events.</strong><p>Submit an event for your campus staff to review.</p></div>';
      status.textContent = events.length + ' upcoming event(s) in your university.';
      if (canModerateCommunity()) await loadCampusContentModeration();
    } catch (err) {
      status.textContent = err.message || 'Could not load campus events.';
      $('campus-events-feed').innerHTML = '<div class="community-empty">Campus events are temporarily unavailable.</div>';
    }
  }

  async function loadCampusMarketplacePage() {
    const backend = window.CampusShieldBackend;
    const status = $('campus-marketplace-status');
    if (!currentProfile || !backend?.isConfigured) return;
    status.textContent = 'Loading your campus marketplace…';
    try {
      campusContext = await backend.getMyCampusContext();
      if (!campusContext?.university_id) {
        status.textContent = 'Choose your university on the Campus community page first.';
        $('campus-marketplace-feed').innerHTML = '';
        return;
      }
      const [listings, ownListingResult] = await Promise.all([
        backend.listCampusMarketplaceListings(),
        backend.client.rpc("list_my_campus_marketplace_listings")
      ]);
      if (ownListingResult.error) throw ownListingResult.error;
      const ownListingIds = new Set((ownListingResult.data || []).map(function(row) { return row.listing_id; }));
      $('campus-marketplace-feed').innerHTML = listings.length ? listings.map(function(listing) {
        const isMine = ownListingIds.has(listing.id);
        return '<article class="community-post">' +
          '<div class="community-meta"><span class="tag open">' + esc(listing.category.replaceAll('_',' ')) + '</span><span>·</span><strong>' + (listing.status === 'sold' ? 'Sold' : 'Available') + '</strong></div>' +
          '<h3 class="community-post-title">' + esc(listing.title) + '</h3>' +
          '<p class="community-post-body">' + esc(listing.description) + '</p>' +
          '<p><strong>' + (listing.price_ngn == null ? 'Price not listed' : '₦' + Number(listing.price_ngn).toLocaleString('en-NG')) + '</strong></p>' +
          '<p class="community-meta">Seller: @' + esc(listing.seller_username || 'campus member') + ' · ' + esc(dateText(listing.created_at)) + '</p>' +
          (listing.contact_instructions ? '<p class="community-meta">Contact: ' + esc(listing.contact_instructions) + '</p>' : '') +
          '<div class="actions">' +
          (listing.status === 'published' ? '<button type="button" class="btn secondary" data-marketplace-report="' + esc(listing.id) + '">Report listing</button>' : '') +
          (isMine && listing.status === 'published' ? '<button type="button" class="btn secondary" data-marketplace-sold="' + esc(listing.id) + '">Mark as sold</button>' : '') +
          '</div></article>';
      }).join('') : '<div class="community-empty"><strong>No approved listings yet.</strong><p>List a textbook, item or service for review by your university moderators.</p></div>';
      status.textContent = listings.length + ' listing(s) in your university marketplace.';
      if (canModerateCommunity()) await loadCampusContentModeration();
    } catch (err) {
      status.textContent = err.message || 'Could not load the campus marketplace.';
      $('campus-marketplace-feed').innerHTML = '<div class="community-empty">The marketplace is temporarily unavailable.</div>';
    }
  }

  async function loadCampusClassroomsPage() {
    const status = $('campus-classrooms-status');
    const feed = $('campus-classrooms-feed');
    const teacherAccess = currentProfile?.role === 'teacher' && hasVerifiedCampusStaffMembership();
    $('classroom-create-panel').hidden = !teacherAccess;
    $('classroom-join-panel').hidden = !isStudentAccount();
    if (!hasVerifiedCampusStaffMembership()) {
      status.textContent = 'A verified account and active verified campus membership are required.';
      feed.innerHTML = '<div class="community-empty">Classrooms are unavailable until your campus membership is verified.</div>';
      return;
    }
    status.textContent = 'Loading your authorized classrooms…';
    try {
      const rows = await window.CampusShieldBackend.listCampusClassrooms();
      status.textContent = rows.length ? rows.length + ' classroom(s) available to your account.' : 'No classrooms are available yet.';
      feed.innerHTML = rows.length ? rows.map(row => `
        <article class="panel">
          <div class="panel-heading"><div><h3>${escapeHubHtml(row.name)}</h3><p class="muted">${escapeHubHtml(row.subject)}</p></div><button class="btn secondary" type="button" data-classroom-open="${escapeHubHtml(row.id)}">Open classroom</button></div>
          <p>${escapeHubHtml(row.description || 'No class description provided.')}</p>
          <p class="muted">Created ${escapeHubHtml(formatHubDate(row.created_at))}</p>
        </article>`).join('') : '<div class="community-empty">No classes yet. A verified teacher can create one, or a student can join using a teacher-provided code.</div>';
    } catch (err) {
      status.textContent = err.message || 'Could not load classrooms.';
      feed.innerHTML = '<div class="community-empty">Classroom data could not be loaded. Check the staging migration and campus access.</div>';
    }
  }

  async function loadCampusClassroomDetail(classroomId) {
    const panel = $('classroom-detail-panel');
    const content = $('classroom-detail-content');
    const status = $('classroom-detail-message');
    panel.hidden = false;
    content.innerHTML = '<div class="community-empty">Loading private class content…</div>';
    status.textContent = '';
    try {
      const classes = await window.CampusShieldBackend.listCampusClassrooms();
      const classroom = classes.find(item => item.id === classroomId);
      if (!classroom) throw new Error('This classroom is not available to your account.');
      const [announcements, materials] = await Promise.all([
        window.CampusShieldBackend.listCampusClassroomAnnouncements(classroomId),
        window.CampusShieldBackend.listCampusClassroomMaterials(classroomId)
      ]);
      const teacherAccess = currentProfile?.role === 'teacher' && hasVerifiedCampusStaffMembership();
      $('classroom-detail-title').textContent = classroom.name;
      $('classroom-detail-subtitle').textContent = classroom.subject + (classroom.description ? ' · ' + classroom.description : '');
      content.innerHTML = `
        <section class="panel"><h3>Announcements</h3>
          ${announcements.length ? announcements.map(item => `<article class="panel"><h4>${escapeHubHtml(item.title)}</h4><p>${escapeHubHtml(item.body)}</p><p class="muted">${escapeHubHtml(formatHubDate(item.created_at))}</p></article>`).join('') : '<p class="muted">No announcements yet.</p>'}
        </section>
        <section class="panel"><h3>Learning links</h3>
          ${materials.length ? materials.map(item => { const url = safeHttpUrl(item.resource_url); return `<article class="panel"><h4>${escapeHubHtml(item.title)}</h4><p>${escapeHubHtml(item.description || '')}</p>${url ? `<p><a href="${escapeHubHtml(url)}" target="_blank" rel="noopener noreferrer">Open learning resource</a></p>` : '<p class="muted">This link is not valid and cannot be opened.</p>'}<p class="muted">${escapeHubHtml(formatHubDate(item.created_at))}</p></article>`; }).join('') : '<p class="muted">No learning links have been shared yet.</p>'}
        </section>
        ${teacherAccess ? `
          <section class="panel"><div class="panel-heading"><div><h3>Teacher tools</h3><p class="muted">These actions are checked again by Supabase.</p></div><button type="button" class="btn secondary" data-classroom-code="${escapeHubHtml(classroomId)}">Show join code</button></div>
            <p id="classroom-join-code-output" class="message" role="status" aria-live="polite"></p>
            <form id="classroomAnnouncementForm" data-classroom-id="${escapeHubHtml(classroomId)}">
              <div class="field"><label for="classroom-announcement-title">Announcement title *</label><input id="classroom-announcement-title" required minlength="3" maxlength="120"></div>
              <div class="field"><label for="classroom-announcement-body">Announcement *</label><textarea id="classroom-announcement-body" required minlength="5" maxlength="4000"></textarea></div>
              <button class="btn" type="submit">Publish announcement</button>
            </form>
            <form id="classroomMaterialForm" data-classroom-id="${escapeHubHtml(classroomId)}" style="margin-top:18px">
              <div class="field"><label for="classroom-material-title">Resource title *</label><input id="classroom-material-title" required minlength="2" maxlength="160"></div>
              <div class="field"><label for="classroom-material-description">Description (optional)</label><textarea id="classroom-material-description" maxlength="1000"></textarea></div>
              <div class="field"><label for="classroom-material-url">Resource link *</label><input id="classroom-material-url" type="url" required maxlength="2048" placeholder="https://..."></div>
              <button class="btn" type="submit">Add learning link</button>
            </form>
          </section>` : ''}
      `;
    } catch (err) {
      content.innerHTML = '<div class="community-empty">Private class content could not be loaded.</div>';
      status.textContent = err.message || 'Could not open this classroom.';
    }
  }

  function resetOpportunityForm() {
    $('campusOpportunityForm').reset();
    $('opportunity-edit-id').value = '';
    $('opportunity-form-heading').textContent = 'Submit an opportunity';
    $('opportunity-save-submit').textContent = 'Save draft';
    $('opportunity-form-cancel').hidden = true;
  }

  function startOpportunityEdit(item) {
    $('opportunity-edit-id').value = item.id;
    $('opportunity-title').value = item.title || '';
    $('opportunity-category').value = item.category || 'other';
    $('opportunity-provider').value = item.provider_name || '';
    $('opportunity-source-url').value = item.source_url || '';
    $('opportunity-contact-url').value = item.contact_url || '';
    if (item.deadline) {
      const date = new Date(item.deadline);
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      $('opportunity-deadline').value = date.toISOString().slice(0, 16);
    } else $('opportunity-deadline').value = '';
    $('opportunity-eligibility').value = item.eligibility || '';
    $('opportunity-description').value = item.description || '';
    $('opportunity-form-heading').textContent = 'Edit your opportunity';
    $('opportunity-save-submit').textContent = 'Save changes';
    $('opportunity-form-cancel').hidden = false;
    $('opportunity-form-message').textContent = 'Edit your draft or rejected submission, then save before resubmitting.';
    $('campusOpportunityForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }


  async function loadCampusCoursesPage() {
    const status = $('campus-courses-status');
    const resourcesStatus = $('campus-course-resources-status');
    const coursesFeed = $('campus-courses-feed');
    const resourcesFeed = $('campus-course-resources-feed');
    const eligible = hasVerifiedCampusStaffMembership();
    const staff = eligible && ['teacher','security','admin'].includes(currentProfile?.role);
    $('campus-course-suggest-panel').hidden = !eligible;
    $('campus-resource-suggest-panel').hidden = !eligible;
    $('campus-course-review-panel').hidden = !staff;
    if (!eligible) {
      status.textContent = 'Choose your university and complete campus verification to use the directory.';
      coursesFeed.innerHTML = '<div class="community-empty">The course directory is available after campus verification.</div>';
      resourcesStatus.textContent = 'Campus verification is required.';
      resourcesFeed.innerHTML = '<div class="community-empty">No resources are shown before campus verification.</div>';
      return;
    }
    status.textContent = 'Loading published courses…';
    resourcesStatus.textContent = 'Loading approved resources…';
    try {
      const [courses, resources] = await Promise.all([
        window.CampusShieldBackend.listCampusCourses(),
        window.CampusShieldBackend.listCampusCourseResources()
      ]);
      let courseGroups = [];
      try { courseGroups = await window.CampusShieldBackend.listCampusCourseGroups(); } catch (_) { courseGroups = []; }
      const groupByCourseId = new Map(courseGroups.filter(group => group.course_id).map(group => [group.course_id, group]));
      const courseById = new Map(courses.map(course => [course.id, course]));
      const resourceSelect = $('campus-resource-course');
      const previousCourseId = resourceSelect.value;
      resourceSelect.innerHTML = '<option value="">Choose a published course</option>' + courses.map(course =>
        '<option value="' + escapeHubHtml(course.id) + '">' + escapeHubHtml(course.course_code + ' · ' + course.title) + '</option>'
      ).join('');
      if (courses.some(course => course.id === previousCourseId)) resourceSelect.value = previousCourseId;
      status.textContent = courses.length ? courses.length + ' published course(s).' : 'No approved courses yet.';
      coursesFeed.innerHTML = courses.length ? courses.map(course => {
        const community = groupByCourseId.get(course.id);
        const communityAction = community
          ? (community.status === 'active'
            ? '<button type="button" class="btn secondary" data-page="groups" data-course-search="' + escapeHubHtml(course.course_code) + '">Open course community</button>'
            : '<button type="button" class="btn secondary" disabled>Community under review</button>')
          : '<button type="button" class="btn secondary" data-create-course-community="' + escapeHubHtml(course.id) + '">Create course community</button>';
        return '<article class="community-moderation-item campus-course-card"><div class="campus-course-card-copy"><h3>' + escapeHubHtml(course.course_code + ' · ' + course.title) + '</h3>' +
        '<p class="muted">' + escapeHubHtml([course.faculty, course.department, course.level === 'all' ? '' : course.level + ' level'].filter(Boolean).join(' · ') || 'Course listing') + '</p>' +
        (course.summary ? '<p>' + escapeHubHtml(course.summary) + '</p>' : '') +
        '</div><div class="campus-course-card-actions">' + communityAction + '</div></article>';
      }).join('') : '<div class="community-empty">No approved courses yet. Suggest a course above; it will appear after campus review.</div>';
      resourcesStatus.textContent = resources.length ? resources.length + ' approved learning resource(s).' : 'No approved resources yet.';
      resourcesFeed.innerHTML = resources.length ? resources.map(resource => {
        const course = courseById.get(resource.course_id);
        const url = safeHttpUrl(resource.source_url);
        return '<article class="community-moderation-item"><h3>' + escapeHubHtml(resource.title) + '</h3>' +
          '<p class="muted">' + escapeHubHtml(course ? course.course_code + ' · ' + course.title : 'Campus resource') + ' · ' +
          escapeHubHtml(resource.resource_type.replaceAll('_',' ')) + ' · ' + escapeHubHtml(resource.source_label) + '</p>' +
          (resource.description ? '<p>' + escapeHubHtml(resource.description) + '</p>' : '') +
          (url ? '<p><a href="' + escapeHubHtml(url) + '" target="_blank" rel="noopener noreferrer">Open external resource</a></p>' : '<p class="muted">Resource URL unavailable.</p>') +
          '</article>';
      }).join('') : '<div class="community-empty">No approved resources yet. Submit a link after its course has been published.</div>';
      if (staff) {
        const queue = await window.CampusShieldBackend.listCampusCourseReviews();
        const entries = [
          ...(queue.courses || []).map(item => ({ kind:'course', item })),
          ...(queue.resources || []).map(item => ({ kind:'resource', item }))
        ];
        $('campus-course-review-status').textContent = entries.length ? entries.length + ' item(s) await review.' : 'No pending courses or resources.';
        $('campus-course-review-feed').innerHTML = entries.length ? entries.map(({kind,item}) =>
          '<article class="community-moderation-item"><h3>' + escapeHubHtml(item.title || item.course_code) + '</h3>' +
          '<p class="muted">' + escapeHubHtml(kind === 'course' ? 'Course · ' + item.course_code : 'Resource · ' + item.source_label) + '</p>' +
          (item.description || item.summary ? '<p>' + escapeHubHtml(item.description || item.summary) + '</p>' : '') +
          '<div class="actions"><button class="btn" type="button" data-campus-directory-review="' + kind + '" data-decision="publish" data-item-id="' + escapeHubHtml(item.id) + '">Approve &amp; publish</button>' +
          '<button class="btn danger" type="button" data-campus-directory-review="' + kind + '" data-decision="reject" data-item-id="' + escapeHubHtml(item.id) + '">Reject</button></div></article>'
        ).join('') : '<div class="community-empty">No items are waiting for review.</div>';
      }
    } catch (error) {
      status.textContent = error.message || 'Could not load courses.';
      resourcesStatus.textContent = 'Could not load resources.';
      coursesFeed.innerHTML = '<div class="community-empty">The course directory could not be loaded.</div>';
      resourcesFeed.innerHTML = '<div class="community-empty">The resource directory could not be loaded.</div>';
    }
  }

  $('campus-course-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    const message = $('campus-course-form-message');
    message.textContent = 'Submitting course suggestion…';
    try {
      await window.CampusShieldBackend.suggestCampusCourse({
        courseCode: $('campus-course-code').value,
        title: $('campus-course-title').value,
        faculty: $('campus-course-faculty').value,
        department: $('campus-course-department').value,
        level: $('campus-course-level').value,
        summary: $('campus-course-summary').value
      });
      this.reset();
      message.textContent = 'Course suggestion submitted for campus review.';
      loadCampusCoursesPage();
    } catch (error) {
      message.textContent = error.message || 'Could not submit course suggestion.';
    }
  });

  $('campus-resource-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    const message = $('campus-resource-form-message');
    message.textContent = 'Submitting resource suggestion…';
    try {
      await window.CampusShieldBackend.suggestCampusCourseResource({
        courseId: $('campus-resource-course').value,
        title: $('campus-resource-title').value,
        description: $('campus-resource-description').value,
        resourceType: $('campus-resource-type').value,
        sourceUrl: $('campus-resource-url').value,
        sourceLabel: $('campus-resource-label').value
      });
      this.reset();
      message.textContent = 'Resource suggestion submitted for campus review.';
      loadCampusCoursesPage();
    } catch (error) {
      message.textContent = error.message || 'Could not submit resource suggestion.';
    }
  });

  $('refresh-campus-courses').addEventListener('click', loadCampusCoursesPage);
  $('refresh-campus-course-reviews').addEventListener('click', loadCampusCoursesPage);

  document.addEventListener('click', async function(event) {
    const bookmark = event.target.closest('[data-opportunity-bookmark]');
    if (bookmark) {
      bookmark.disabled = true;
      try {
        if (bookmark.dataset.opportunityBookmark === 'save') {
          await window.CampusShieldBackend.saveCampusOpportunity(bookmark.dataset.opportunityId);
        } else {
          await window.CampusShieldBackend.unsaveCampusOpportunity(bookmark.dataset.opportunityId);
        }
        await loadCampusOpportunitiesPage();
      } catch (error) {
        toast(error.message || 'Could not update saved opportunities.');
        bookmark.disabled = false;
      }
      return;
    }
    const review = event.target.closest('[data-campus-directory-review]');
    if (review) {
      review.disabled = true;
      try {
        const method = review.dataset.campusDirectoryReview === 'course' ? 'reviewCampusCourse' : 'reviewCampusCourseResource';
        await window.CampusShieldBackend[method](review.dataset.itemId, review.dataset.decision);
        await loadCampusCoursesPage();
      } catch (error) {
        toast(error.message || 'Could not review this item.');
        review.disabled = false;
      }
    }
  });

  function renderOpportunityCard(item, ownerActions = false, reviewActions = false, isSaved = false) {
    const sourceUrl = safeHttpUrl(item.source_url);
    const contactUrl = safeHttpUrl(item.contact_url);
    const status = String(item.status || 'published');
    const statusTag = status === 'published' ? 'Published' : status.charAt(0).toUpperCase() + status.slice(1);
    return `
      <article class="panel">
        <div class="panel-heading"><div><h3>${escapeHubHtml(item.title)}</h3><p class="muted">${escapeHubHtml(item.category.replaceAll('_',' '))} · ${escapeHubHtml(item.provider_name)}</p></div><span class="tag ${status === 'published' ? 'resolved' : 'open'}">${escapeHubHtml(statusTag)}</span></div>
        <p>${escapeHubHtml(item.description)}</p>
        ${item.eligibility ? `<p><strong>Eligibility:</strong> ${escapeHubHtml(item.eligibility)}</p>` : ''}
        <p class="muted">Deadline: ${escapeHubHtml(formatHubDate(item.deadline))}</p>
        <p>${sourceUrl ? `<a href="${escapeHubHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Check source</a>` : '<span class="muted">Source link unavailable</span>'}
        ${contactUrl ? ` · <a href="${escapeHubHtml(contactUrl)}" target="_blank" rel="noopener noreferrer">Application / contact</a>` : ''}</p>
        <p class="muted">${item.is_official ? 'Officially verified publisher' : 'Community-submitted · verify the source independently'}</p>
        ${status === 'published' && !ownerActions && !reviewActions ? `<div class="actions"><button type="button" class="btn secondary" data-opportunity-bookmark="${isSaved ? 'remove' : 'save'}" data-opportunity-id="${escapeHubHtml(item.id)}">${isSaved ? 'Remove saved opportunity' : 'Save opportunity'}</button></div>` : ''}
        ${ownerActions && ['draft','rejected'].includes(status) ? `
          <div class="actions"><button type="button" class="btn secondary" data-opportunity-edit="${escapeHubHtml(item.id)}">Edit</button><button type="button" class="btn" data-opportunity-submit="${escapeHubHtml(item.id)}" ${item.deadline && new Date(item.deadline).getTime() <= Date.now() ? 'disabled' : ''}>Submit for review</button></div>
        ` : ''}
        ${reviewActions && status === 'pending' ? `
          <div class="field"><label for="opportunity-review-notes-${escapeHubHtml(item.id)}">Rejection reason (required when rejecting)</label><textarea id="opportunity-review-notes-${escapeHubHtml(item.id)}" data-opportunity-review-notes maxlength="1000" placeholder="Explain what needs correction"></textarea></div>
          <div class="actions"><button type="button" class="btn" data-opportunity-review="publish" data-opportunity-id="${escapeHubHtml(item.id)}">Approve & publish</button><button type="button" class="btn danger" data-opportunity-review="reject" data-opportunity-id="${escapeHubHtml(item.id)}">Reject</button></div>
        ` : ''}
      </article>`;
  }

  async function loadCampusOpportunitiesPage() {
    const status = $('campus-opportunities-status');
    const feed = $('campus-opportunities-feed');
    const myStatus = $('my-opportunities-status');
    const myFeed = $('my-opportunities-feed');
    const staffAccess = hasVerifiedCampusStaffMembership() && ['teacher','security','admin'].includes(currentProfile?.role);
    $('opportunity-review-panel').hidden = !staffAccess;
    $('opportunity-create-panel').hidden = !hasVerifiedCampusStaffMembership();
    if (!hasVerifiedCampusStaffMembership()) {
      status.textContent = 'A verified account and active verified campus membership are required.';
      feed.innerHTML = '<div class="community-empty">The Opportunity Hub is unavailable until your campus membership is verified.</div>';
      myStatus.textContent = 'Verify your campus membership to manage submissions.';
      myFeed.innerHTML = '<div class="community-empty">No submissions are available.</div>';
      return;
    }
    status.textContent = 'Loading published opportunities…';
    myStatus.textContent = 'Loading your submissions…';
    try {
      const [allRows, myRows, bookmarks] = await Promise.all([
        window.CampusShieldBackend.listCampusOpportunities(),
        window.CampusShieldBackend.listMyCampusOpportunities(),
        window.CampusShieldBackend.listOpportunityBookmarks()
      ]);
      const savedIds = new Set(bookmarks.map(item => item.opportunity_id));
      const published = allRows.filter(item => item.status === 'published' && (!item.deadline || new Date(item.deadline).getTime() > Date.now()));
      const pending = allRows.filter(item => item.status === 'pending');
      status.textContent = published.length ? published.length + ' published opportunity(ies).' : 'No published opportunities yet.';
      feed.innerHTML = published.length ? published.map(item => renderOpportunityCard(item, false, false, savedIds.has(item.id))).join('') : '<div class="community-empty">No approved opportunities yet. Check back after campus review.</div>';
      myStatus.textContent = myRows.length ? myRows.length + ' submission(s) created by your account.' : 'You have not submitted an opportunity yet.';
      myFeed.innerHTML = myRows.length ? myRows.map(item => renderOpportunityCard(item, true)).join('') : '<div class="community-empty">Your drafts and submissions will appear here.</div>';
      if (staffAccess) {
        $('opportunity-review-status').textContent = pending.length ? pending.length + ' listing(s) awaiting review in your campus.' : 'No pending listings in your campus review queue.';
        $('opportunity-review-feed').innerHTML = pending.length ? pending.map(item => renderOpportunityCard(item, false, true)).join('') : '<div class="community-empty">No opportunities are waiting for review.</div>';
      }
    } catch (err) {
      status.textContent = err.message || 'Could not load opportunities.';
      myStatus.textContent = 'Could not load your submissions.';
      feed.innerHTML = '<div class="community-empty">Opportunity data could not be loaded. Confirm the campus-life database migration has been applied.</div>';
      myFeed.innerHTML = '<div class="community-empty">Your submissions could not be loaded.</div>';
    }
  }

  async function loadCampusContentModeration() {
    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured || !canModerateCommunity()) {
      $('campus-content-moderation').hidden = true;
      return;
    }
    $('campus-content-moderation').hidden = false;
    const status = $('campus-content-moderation-message');
    status.textContent = 'Loading your campus review queue…';
    try {
      const data = await backend.listCampusContentModeration();
      const groups = data.groups || [];
      const events = data.events || [];
      const listings = data.listings || [];
      const reports = data.listing_reports || [];
      const makeCard = function(type, item, name, summary, meta) {
        return '<article class="community-moderation-item">' +
          '<h4>' + esc(name) + '</h4><p>' + esc(summary || '') + '</p><p class="community-meta">' + esc(meta || '') + '</p>' +
          '<div class="actions"><button type="button" class="btn" data-campus-content-review="publish" data-campus-content-type="' + type + '" data-campus-content-id="' + esc(item.id) + '">Approve</button>' +
          '<button type="button" class="btn danger" data-campus-content-review="reject" data-campus-content-type="' + type + '" data-campus-content-id="' + esc(item.id) + '">Reject</button></div></article>';
      };
      $('moderation-groups-feed').innerHTML = groups.length ? groups.map(x => makeCard('group',x,x.name,x.description,x.group_type+' · @'+(x.creator_username||'member'))).join('') : '<div class="community-empty">No groups awaiting review.</div>';
      $('moderation-events-feed').innerHTML = events.length ? events.map(x => makeCard('event',x,x.title,x.description,x.category+' · '+dateText(x.starts_at))).join('') : '<div class="community-empty">No events awaiting review.</div>';
      $('moderation-listings-feed').innerHTML = listings.length ? listings.map(x => makeCard('listing',x,x.title,x.description,x.category+' · '+(x.price_ngn == null ? 'no price' : '₦'+Number(x.price_ngn).toLocaleString('en-NG')))).join('') : '<div class="community-empty">No listings awaiting review.</div>';
      $('moderation-listing-reports-feed').innerHTML = reports.length ? reports.map(function(x) {
        return '<article class="community-moderation-item"><h4>'+esc(x.listing_title || 'Marketplace listing')+'</h4><p>'+esc(String(x.reason||'other').replaceAll('_',' '))+'</p><p>'+esc(x.details || 'No extra details provided.')+'</p><div class="actions"><button class="btn danger" type="button" data-marketplace-report-review="hide_listing" data-marketplace-report-id="'+esc(x.id)+'">Hide listing</button><button class="btn secondary" type="button" data-marketplace-report-review="dismissed" data-marketplace-report-id="'+esc(x.id)+'">Dismiss report</button></div></article>';
      }).join('') : '<div class="community-empty">No marketplace reports pending.</div>';
      status.textContent = 'Queue loaded · '+groups.length+' group(s), '+events.length+' event(s), '+listings.length+' listing(s), '+reports.length+' marketplace report(s).';
    } catch (err) {
      status.textContent = err.message || 'Campus moderation queue is unavailable.';
    }
  }

  $('communityUsernameForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const backend = window.CampusShieldBackend;
    const input = $('community-username');
    const message = $('community-profile-message');
    const username = input.value.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      message.textContent = 'Use 3–20 lowercase letters, numbers, or underscores.';
      return;
    }
    if (!backend?.isConfigured) {
      message.textContent = 'Supabase is not configured.';
      return;
    }

    const button = $('community-username-save');
    button.disabled = true;
    message.textContent = 'Saving username…';
    try {
      const savedUsername = await backend.setMyCommunityUsername(username);
      communityProfile = Object.assign({}, communityProfile || {}, { username: savedUsername });
      $('community-username-current').textContent = '@' + savedUsername;
      input.value = savedUsername;
      message.textContent = 'Your public username has been updated.';
      toast('Username updated.');
    } catch (err) {
      message.textContent = err.message || 'Could not save username.';
    } finally {
      button.disabled = false;
    }
  });

  function syncCommunityPollFields() {
    const isPoll = $('community-post-type').value === 'poll';
    $('community-poll-options').hidden = !isPoll;
    ['community-poll-option-1','community-poll-option-2'].forEach(function(id) {
      $(id).required = isPoll;
    });
  }
  $('community-post-type').addEventListener('change', syncCommunityPollFields);
  syncCommunityPollFields();

  $('communityPostForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const backend = window.CampusShieldBackend;
    const button = $('community-post-submit');
    const message = $('community-post-message');
    if (!backend?.isConfigured) {
      message.textContent = 'Supabase is not configured.';
      return;
    }
    if (button.disabled) return;

    const postType = $('community-post-type').value;
    const title = $('community-post-title-input').value.trim();
    const body = $('community-post-body').value.trim();
    const location = $('community-post-location').value.trim();
    const options = [
      $('community-poll-option-1').value.trim(),
      $('community-poll-option-2').value.trim(),
      $('community-poll-option-3').value.trim(),
      $('community-poll-option-4').value.trim()
    ];
    button.disabled = true;
    button.textContent = postType === 'announcement' ? 'Publishing announcement…' : 'Submitting for review…';
    message.textContent = 'Sending your post…';
    try {
      const selectedFiles = Array.from($('community-post-media').files || []);
      if (selectedFiles.length > 4) throw new Error("Attach no more than four files to one post.");
      const postId = await backend.createCommunityPost({ postType: postType, title: title, body: body, location: location, options: options });
      if (selectedFiles.length) {
        message.textContent = 'Post saved. Uploading private campus attachments…';
        await backend.uploadCommunityPostMedia(postId, selectedFiles, $('community-post-media-alt').value.trim());
      }
      $('communityPostForm').reset();
      syncCommunityPollFields();
      message.textContent = postType === 'announcement'
        ? 'Official announcement published.'
        : 'Submitted. Your post will appear to other students after moderation.';
      toast(selectedFiles.length ? 'Post and attachments submitted for review.' : (postType === 'announcement' ? 'Official announcement published.' : 'Community post submitted for review.'));
      await loadCommunityPage();
    } catch (err) {
      message.textContent = err.message || 'Could not submit your post.';
    } finally {
      button.disabled = false;
      button.textContent = 'Submit for review';
    }
  });

  $('community-feed').addEventListener('submit', async function(event) {
    const form = event.target.closest('[data-community-comment-form]');
    if (!form) return;
    event.preventDefault();
    const backend = window.CampusShieldBackend;
    const button = form.querySelector('button[type="submit"]');
    const textarea = form.querySelector('textarea[name="comment"]');
    const postId = form.dataset.postId;
    const body = textarea.value.trim();
    if (!backend?.isConfigured) {
      toast('Supabase is not configured.');
      return;
    }
    if (body.length < 2 || body.length > 800) {
      toast('Comments must be 2–800 characters.');
      return;
    }
    button.disabled = true;
    try {
      await backend.createCommunityComment(postId, body);
      toast('Comment added.');
      await loadCommunityPage();
    } catch (err) {
      toast(err.message || 'Could not add comment.');
    } finally {
      button.disabled = false;
    }
  });

  $('community-feed').addEventListener('click', async function(event) {
    const reactionButton = event.target.closest('[data-community-reaction]');
    const bookmarkButton = event.target.closest('[data-community-bookmark]');
    const repostButton = event.target.closest('[data-community-repost]');
    const followButton = event.target.closest('[data-community-follow]');
    const pollButton = event.target.closest('[data-community-poll-vote]');
    const replyButton = event.target.closest('[data-community-reply]');
    const backend = window.CampusShieldBackend;

    try {
      if (reactionButton) {
        await backend.toggleCommunityReaction(reactionButton.dataset.communityReaction, 'like');
        toast('Reaction updated.');
        await loadCommunityPage();
        return;
      }
      if (bookmarkButton) {
        const saved = await backend.toggleCommunityBookmark(bookmarkButton.dataset.communityBookmark);
        toast(saved ? 'Post bookmarked.' : 'Bookmark removed.');
        await loadCommunityPage();
        return;
      }
      if (repostButton) {
        if (!confirm('Repost this campus update for review? It will only be shared inside your university.')) return;
        await backend.repostCommunityPost(repostButton.dataset.communityRepost);
        toast('Repost submitted for campus moderation.');
        await loadCommunityPage();
        return;
      }
      if (followButton) {
        const follow = followButton.dataset.followState !== 'following';
        await backend.toggleCampusFollowPostAuthor(followButton.dataset.communityFollow, follow);
        toast(follow ? 'Following this campus member.' : 'You unfollowed this campus member.');
        await loadCommunityPage();
        return;
      }
      if (pollButton) {
        const postId = pollButton.dataset.communityPollVote;
        const selected = Array.from($('community-feed').querySelectorAll('input[type="radio"]'))
          .find(function(input) { return input.name === 'poll-' + postId && input.checked; });
        if (!selected) {
          toast('Choose an answer before voting.');
          return;
        }
        await backend.voteCommunityPoll(postId, selected.value);
        toast('Your vote has been saved.');
        await loadCommunityPage();
        return;
      }
      if (replyButton) {
        const body = window.prompt('Write a respectful reply (2–800 characters):', '');
        if (body === null) return;
        if (body.trim().length < 2 || body.trim().length > 800) {
          toast('Replies must be 2–800 characters.');
          return;
        }
        await backend.createCommunityReply(replyButton.dataset.postId, replyButton.dataset.communityReply, body.trim());
        toast('Reply added.');
        await loadCommunityPage();
        return;
      }
    } catch (err) {
      console.error('Campus social action failed:', err);
      toast(err.message || 'Could not complete this action.');
      return;
    }

    const button = event.target.closest('[data-report-community-type]');
    if (!button) return;
    const targetType = button.dataset.reportCommunityType;
    const targetId = button.dataset.reportCommunityId;
    const answer = window.prompt('Why are you reporting this ' + targetType + '?\n1 = Spam\n2 = Harassment\n3 = Personal information\n4 = Misinformation\n5 = Other', '5');
    if (answer === null) return;
    const reasons = { '1': 'spam', '2': 'harassment', '3': 'personal_information', '4': 'misinformation', '5': 'other' };
    const reason = reasons[String(answer).trim()];
    if (!reason) {
      toast('Choose a reason from 1 to 5.');
      return;
    }
    const details = window.prompt('Optional details (do not include private information):', '') || '';
    try {
      await window.CampusShieldBackend.reportCommunityContent(targetType, targetId, reason, details.trim());
      toast('Report sent to the moderation team.');
    } catch (err) {
      toast(err.message || 'Could not report this content.');
    }
  });

  $('community-moderation').addEventListener('click', async function(event) {
    const postButton = event.target.closest('[data-moderate-community-post]');
    const reportButton = event.target.closest('[data-community-report-action]');
    const backend = window.CampusShieldBackend;
    if (postButton) {
      const decision = postButton.dataset.moderateCommunityPost;
      const postId = postButton.dataset.communityPostId;
      if (!confirm('Are you sure you want to ' + decision + ' this community post?')) return;
      postButton.disabled = true;
      try {
        await backend.moderateCommunityPost(postId, decision);
        toast(decision === 'publish' ? 'Community post published.' : 'Community post rejected.');
        await loadCommunityPage();
      } catch (err) {
        toast(err.message || 'Moderation failed.');
        postButton.disabled = false;
      }
      return;
    }

    if (!reportButton) return;
    const action = reportButton.dataset.communityReportAction;
    const reportId = reportButton.dataset.communityReportId;
    reportButton.disabled = true;
    try {
      if (action === 'hide') {
        const targetType = reportButton.dataset.communityReportType;
        const targetId = reportButton.dataset.communityTargetId;
        if (!confirm('Hide this content and mark the report as reviewed?')) {
          reportButton.disabled = false;
          return;
        }
        if (targetType === 'post') await backend.moderateCommunityPost(targetId, 'hide');
        else await backend.moderateCommunityComment(targetId, 'hide');
        await backend.resolveCommunityReport(reportId, 'reviewed');
      } else {
        await backend.resolveCommunityReport(reportId, 'dismissed');
      }
      toast(action === 'hide' ? 'Content hidden and report reviewed.' : 'Report dismissed.');
      await loadCommunityPage();
    } catch (err) {
      toast(err.message || 'Could not update the report.');
      reportButton.disabled = false;
    }
  });

  $('refresh-community').addEventListener('click', loadCommunityPage);
  $('refresh-community-moderation').addEventListener('click', loadCommunityPage);

  async function populateCampusSelectors() {
    const backend = window.CampusShieldBackend;
    if (!backend?.isConfigured) {
      setInstitutionSearchStatus('The university directory is unavailable. You can still sign in; try again later for campus search.');
      return;
    }
    try {
      if (!campusUniversitiesCache) campusUniversitiesCache = await backend.listCampusUniversities();
      const selects = [$('auth-university'), $('campus-university')];
      selects.forEach(function(select) {
        if (!select) return;
        const previous = select.value;
        select.innerHTML = '<option value="">Choose your university</option>' + campusUniversitiesCache.map(function(university) {
          return '<option value="' + esc(university.id) + '">' + esc(university.name) + ' · ' + esc(university.state || '') + '</option>';
        }).join('');
        if (previous && campusUniversitiesCache.some(u => u.id === previous)) select.value = previous;
      });
      refreshInstitutionSuggestions();
    } catch (err) {
      console.error('Could not load university directory:', err);
      const select = $('campus-university');
      if (select) select.innerHTML = '<option value="">University directory unavailable</option>';
      setInstitutionSearchStatus('Could not load the university directory. Sign-in remains available.');
    }
  }

  function normalizeInstitutionSearch(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function institutionSearchAliases(name) {
    const words = normalizeInstitutionSearch(name).split(' ').filter(function(word) {
      return word && !['of', 'the', 'and', 'for', 'in', 'at'].includes(word);
    });
    if (!words.length) return [];
    const aliases = new Set([
      words.map(function(word) { return word[0]; }).join(''),
      words.map(function(word) { return word.slice(0, 3); }).join('')
    ]);
    if (words[0] === 'university' && words.length > 1) {
      aliases.add('uni' + words.slice(1).map(function(word) { return word.slice(0, 3); }).join(''));
      aliases.add('uni' + words.slice(1).map(function(word) { return word[0]; }).join(''));
    }
    return Array.from(aliases);
  }

  function institutionMatchesSearch(university, query) {
    const name = normalizeInstitutionSearch(university.name);
    const state = normalizeInstitutionSearch(university.state);
    const queryTokens = query.split(' ').filter(Boolean);
    const nameTokens = name.split(' ');
    const compactQuery = query.replace(/\s/g, '');
    const matchesNameWords = queryTokens.every(function(token) {
      return nameTokens.some(function(nameToken) { return nameToken.startsWith(token); });
    });
    const matchesAlias = compactQuery.length >= 3 && institutionSearchAliases(university.name)
      .some(function(alias) { return alias.startsWith(compactQuery); });
    return name.includes(query) || state.includes(query) || matchesNameWords || matchesAlias;
  }

  function setInstitutionSearchStatus(message) {
    ['signin-institution-search-status', 'auth-university-search-status'].forEach(function(id) {
      const node = $(id);
      if (node) node.textContent = message || '';
    });
  }

  function refreshInstitutionSuggestions() {
    const directory = Array.isArray(campusUniversitiesCache) ? campusUniversitiesCache : [];
    [
      { input: $('signin-institution'), list: $('signin-institution-suggestions'), mode: 'hint' },
      { input: $('auth-university-search'), list: $('auth-university-suggestions'), mode: 'signup' }
    ].forEach(function(pair) {
      if (!pair.input || !pair.list) return;
      const query = normalizeInstitutionSearch(pair.input.value);
      const matches = query
        ? directory.filter(function(university) { return institutionMatchesSearch(university, query); })
        : directory;
      pair.list.replaceChildren();
      matches.forEach(function(university) {
        const option = document.createElement('option');
        option.value = university.name;
        option.label = [university.state, university.ownership].filter(Boolean).join(' · ');
        pair.list.appendChild(option);
      });
      if (pair.mode === 'hint') {
        const status = $('signin-institution-search-status');
        if (status && query) status.textContent = matches.length
          ? matches.length + ' matching institution(s) in the CampusShield directory.'
          : 'No match in the current CampusShield directory. You can still sign in; this field is only a hint.';
      }
    });
  }

  function resolveSignupInstitutionSearch() {
    const search = $('auth-university-search');
    const select = $('auth-university');
    const status = $('auth-university-search-status');
    if (!search || !select) return false;
    const query = normalizeInstitutionSearch(search.value);
    const compactQuery = query.replace(/\s/g, '');
    const matches = (campusUniversitiesCache || []).filter(function(university) {
      return normalizeInstitutionSearch(university.name) === query || institutionSearchAliases(university.name).includes(compactQuery);
    });
    if (matches.length === 1) {
      select.value = matches[0].id;
      search.setAttribute('aria-invalid', 'false');
      if (status) status.textContent = 'Selected: ' + matches[0].name + (matches[0].state ? ' · ' + matches[0].state : '');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    select.value = '';
    search.setAttribute('aria-invalid', query ? 'true' : 'false');
    if (status) status.textContent = query
      ? 'Choose an exact institution name from the suggestions. If it is not listed, request that it be added.'
      : 'Start typing to search the directory.';
    return false;
  }

  function bindInstitutionTypeahead() {
    const loginSearch = $('signin-institution');
    if (loginSearch) {
      loginSearch.addEventListener('input', refreshInstitutionSuggestions);
      loginSearch.addEventListener('change', refreshInstitutionSuggestions);
    }
    const signupSearch = $('auth-university-search');
    if (signupSearch) {
      signupSearch.addEventListener('input', function() {
        refreshInstitutionSuggestions();
        resolveSignupInstitutionSearch();
      });
      signupSearch.addEventListener('change', resolveSignupInstitutionSearch);
      signupSearch.addEventListener('blur', resolveSignupInstitutionSearch);
    }
  }
  bindInstitutionTypeahead();

  populateCampusSelectors();

  $('campusOnboardingForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const button = $('campus-onboarding-submit');
    const message = $('campus-onboarding-message');
    button.disabled = true;
    message.textContent = 'Saving your campus selection…';
    try {
      const selectedUniversityId = $('campus-university').value;
      await window.CampusShieldBackend.setMyCampusMembership({
        universityId: selectedUniversityId,
        faculty: $('campus-faculty').value.trim(),
        department: $('campus-department').value.trim(),
        course: $('campus-course').value.trim(),
        yearOfStudy: $('campus-year').value
      });
      let bootstrappedAdmin = false;
      if (currentProfile?.role === 'admin' && currentProfile?.verification_status === 'verified') {
        bootstrappedAdmin = await window.CampusShieldBackend.bootstrapFirstCampusAdmin(selectedUniversityId);
      }
      message.textContent = bootstrappedAdmin
        ? 'University space created and initial campus administrator initialized.'
        : 'University space created. Staff-only powers require this campus membership to be verified.';
      campusContext = await window.CampusShieldBackend.getMyCampusContext();
      syncCampusAccessNavigation();
      await refreshIncidentsFromSupabase();
      await loadCommunityPage();
      toast('You have joined your university space.');
    } catch (err) {
      message.textContent = err.message || 'Could not join this campus.';
    } finally {
      button.disabled = false;
    }
  });

  $('campusUniversityRequestForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const button = $('request-university-submit');
    const message = $('campus-university-request-message');
    button.disabled = true;
    message.textContent = 'Sending request…';
    try {
      await window.CampusShieldBackend.requestCampusUniversity({
        name: $('request-university-name').value.trim(),
        state: $('request-university-state').value.trim(),
        ownership: $('request-university-ownership').value,
        website: $('request-university-website').value.trim()
      });
      $('campusUniversityRequestForm').reset();
      message.textContent = 'University listing request sent for review. You can join the campus after it is added.';
      toast('University request submitted.');
    } catch (err) {
      message.textContent = err.message || 'Could not submit the request.';
    } finally {
      button.disabled = false;
    }
  });

  $('campusClassroomCreateForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const button = $('classroom-create-submit');
    const message = $('classroom-create-message');
    button.disabled = true;
    message.textContent = 'Creating classroom…';
    try {
      await window.CampusShieldBackend.createCampusClassroom({
        name: $('classroom-name').value.trim(),
        subject: $('classroom-subject').value.trim(),
        description: $('classroom-description').value.trim()
      });
      $('campusClassroomCreateForm').reset();
      message.textContent = 'Classroom created. Open it below to retrieve the private join code and add learning content.';
      await loadCampusClassroomsPage();
    } catch (err) {
      message.textContent = err.message || 'Could not create this classroom.';
    } finally {
      button.disabled = false;
    }
  });

  $('campusClassroomJoinForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const button = $('classroom-join-submit');
    const message = $('classroom-join-message');
    button.disabled = true;
    message.textContent = 'Checking the class code…';
    try {
      const classroomId = await window.CampusShieldBackend.joinCampusClassroom($('classroom-join-code').value.trim());
      $('campusClassroomJoinForm').reset();
      message.textContent = 'You joined the classroom.';
      await loadCampusClassroomsPage();
      if (classroomId) await loadCampusClassroomDetail(classroomId);
    } catch (err) {
      message.textContent = err.message || 'Could not join this classroom. Check the code and your verified campus membership.';
    } finally {
      button.disabled = false;
    }
  });

  $('page-classroom').addEventListener('click', async function(event) {
    const openButton = event.target.closest('[data-classroom-open]');
    const codeButton = event.target.closest('[data-classroom-code]');
    if (openButton) {
      await loadCampusClassroomDetail(openButton.dataset.classroomOpen);
      return;
    }
    if (codeButton) {
      const output = $('classroom-join-code-output');
      codeButton.disabled = true;
      output.textContent = 'Retrieving the private class code…';
      try {
        const code = await window.CampusShieldBackend.getCampusClassroomJoinCode(codeButton.dataset.classroomCode);
        output.textContent = 'Share this code only with verified students at your university: ' + String(code || '');
      } catch (err) {
        output.textContent = err.message || 'Only the verified teacher who owns this class can retrieve its code.';
      } finally {
        codeButton.disabled = false;
      }
    }
  });

  $('page-classroom').addEventListener('submit', async function(event) {
    const form = event.target;
    if (form.id === 'classroomAnnouncementForm') {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      $('classroom-detail-message').textContent = 'Publishing announcement…';
      try {
        await window.CampusShieldBackend.createCampusClassroomAnnouncement(
          form.dataset.classroomId,
          $('classroom-announcement-title').value.trim(),
          $('classroom-announcement-body').value.trim()
        );
        await loadCampusClassroomDetail(form.dataset.classroomId);
        $('classroom-detail-message').textContent = 'Announcement published to this class.';
      } catch (err) {
        $('classroom-detail-message').textContent = err.message || 'Could not publish this announcement.';
        button.disabled = false;
      }
    }
    if (form.id === 'classroomMaterialForm') {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      $('classroom-detail-message').textContent = 'Adding learning link…';
      try {
        await window.CampusShieldBackend.createCampusClassroomMaterial(
          form.dataset.classroomId,
          $('classroom-material-title').value.trim(),
          $('classroom-material-description').value.trim(),
          $('classroom-material-url').value.trim()
        );
        await loadCampusClassroomDetail(form.dataset.classroomId);
        $('classroom-detail-message').textContent = 'Learning link added to this class.';
      } catch (err) {
        $('classroom-detail-message').textContent = err.message || 'Could not add this learning link.';
        button.disabled = false;
      }
    }
  });

  $('close-classroom-detail').addEventListener('click', function() {
    $('classroom-detail-panel').hidden = true;
    $('classroom-detail-content').replaceChildren();
    $('classroom-detail-message').textContent = '';
  });

  $('campusOpportunityForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const button = $('opportunity-save-submit');
    const message = $('opportunity-form-message');
    const editId = $('opportunity-edit-id').value;
    const deadlineInput = $('opportunity-deadline').value;
    const input = {
      id: editId || null,
      title: $('opportunity-title').value.trim(),
      category: $('opportunity-category').value,
      providerName: $('opportunity-provider').value.trim(),
      sourceUrl: $('opportunity-source-url').value.trim(),
      contactUrl: $('opportunity-contact-url').value.trim(),
      deadline: deadlineInput ? new Date(deadlineInput).toISOString() : null,
      eligibility: $('opportunity-eligibility').value.trim(),
      description: $('opportunity-description').value.trim()
    };
    button.disabled = true;
    message.textContent = editId ? 'Saving your changes…' : 'Saving your draft…';
    try {
      if (editId) {
        await window.CampusShieldBackend.updateMyCampusOpportunity(input);
        message.textContent = 'Changes saved. You can submit the listing again when ready.';
      } else {
        await window.CampusShieldBackend.createCampusOpportunity(input);
        message.textContent = 'Draft saved. Review it under My submissions and submit it when ready.';
      }
      resetOpportunityForm();
      await loadCampusOpportunitiesPage();
    } catch (err) {
      message.textContent = err.message || 'Could not save this opportunity.';
    } finally {
      button.disabled = false;
    }
  });

  $('opportunity-form-cancel').addEventListener('click', function() {
    resetOpportunityForm();
    $('opportunity-form-message').textContent = 'Editing cancelled.';
  });

  $('page-opportunities').addEventListener('click', async function(event) {
    const editButton = event.target.closest('[data-opportunity-edit]');
    const submitButton = event.target.closest('[data-opportunity-submit]');
    const reviewButton = event.target.closest('[data-opportunity-review]');
    if (editButton) {
      try {
        const rows = await window.CampusShieldBackend.listMyCampusOpportunities();
        const item = rows.find(row => row.id === editButton.dataset.opportunityEdit);
        if (!item) throw new Error('This draft is not available to your account.');
        startOpportunityEdit(item);
      } catch (err) {
        $('my-opportunities-status').textContent = err.message || 'Could not open this draft.';
      }
      return;
    }
    if (submitButton) {
      submitButton.disabled = true;
      $('my-opportunities-status').textContent = 'Submitting for campus review…';
      try {
        await window.CampusShieldBackend.submitCampusOpportunity(submitButton.dataset.opportunitySubmit);
        $('my-opportunities-status').textContent = 'Submitted for campus review.';
        await loadCampusOpportunitiesPage();
      } catch (err) {
        $('my-opportunities-status').textContent = err.message || 'Could not submit this opportunity.';
        submitButton.disabled = false;
      }
      return;
    }
    if (reviewButton) {
      const decision = reviewButton.dataset.opportunityReview;
      const card = reviewButton.closest('article');
      const notes = card?.querySelector('[data-opportunity-review-notes]')?.value.trim() || '';
      if (decision === 'reject' && notes.length < 3) {
        $('opportunity-review-status').textContent = 'Enter a short rejection reason before rejecting this listing.';
        return;
      }
      reviewButton.disabled = true;
      $('opportunity-review-status').textContent = decision === 'publish' ? 'Publishing opportunity…' : 'Recording rejection…';
      try {
        await window.CampusShieldBackend.reviewCampusOpportunity(
          reviewButton.dataset.opportunityId, decision, decision === 'reject' ? notes : null
        );
        $('opportunity-review-status').textContent = decision === 'publish' ? 'Opportunity approved and published.' : 'Opportunity rejected with a review reason.';
        await loadCampusOpportunitiesPage();
      } catch (err) {
        $('opportunity-review-status').textContent = err.message || 'Could not review this opportunity.';
        reviewButton.disabled = false;
      }
    }
  });

  $('refresh-campus-classrooms').addEventListener('click', loadCampusClassroomsPage);
  $('refresh-campus-opportunities').addEventListener('click', loadCampusOpportunitiesPage);
  $('refresh-my-opportunities').addEventListener('click', loadCampusOpportunitiesPage);

  $('campusGroupForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const button = $('campus-group-submit');
    const message = $('campus-group-message');
    button.disabled = true;
    message.textContent = 'Submitting your group…';
    try {
      await window.CampusShieldBackend.createCampusGroup({
        name: $('campus-group-name').value.trim(),
        groupType: $('campus-group-type').value,
        privacy: $('campus-group-privacy').value,
        description: $('campus-group-description').value.trim()
      });
      $('campusGroupForm').reset();
      message.textContent = 'Group submitted. It will appear only in your university after campus staff approve it.';
      toast('Group submitted for campus review.');
      await loadCampusGroupsPage();
    } catch (err) {
      message.textContent = err.message || 'Could not submit this group.';
    } finally {
      button.disabled = false;
    }
  });

  $('campusEventForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const button = $('campus-event-submit');
    const message = $('campus-event-message');
    const starts = $('campus-event-start').value;
    const ends = $('campus-event-end').value;
    if (ends && new Date(ends).getTime() < new Date(starts).getTime()) {
      message.textContent = 'The event end time must be after the start time.';
      return;
    }
    button.disabled = true;
    message.textContent = 'Submitting event…';
    try {
      await window.CampusShieldBackend.createCampusEvent({
        title: $('campus-event-title').value.trim(),
        category: $('campus-event-category').value,
        startsAt: new Date(starts).toISOString(),
        endsAt: ends ? new Date(ends).toISOString() : null,
        location: $('campus-event-location').value.trim(),
        description: $('campus-event-description').value.trim()
      });
      $('campusEventForm').reset();
      message.textContent = 'Event submitted. It will only appear to your university after approval.';
      toast('Event submitted for campus review.');
      await loadCampusEventsPage();
    } catch (err) {
      message.textContent = err.message || 'Could not submit this event.';
    } finally {
      button.disabled = false;
    }
  });

  $('campusMarketplaceForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const button = $('campus-listing-submit');
    const message = $('campus-listing-message');
    button.disabled = true;
    message.textContent = 'Submitting listing…';
    try {
      await window.CampusShieldBackend.createCampusMarketplaceListing({
        category: $('campus-listing-category').value,
        title: $('campus-listing-title').value.trim(),
        priceNgn: $('campus-listing-price').value,
        description: $('campus-listing-description').value.trim(),
        contactInstructions: $('campus-listing-contact').value.trim()
      });
      $('campusMarketplaceForm').reset();
      message.textContent = 'Listing submitted for review. CampusShield does not process payments or escrow.';
      toast('Marketplace listing submitted for campus review.');
      await loadCampusMarketplacePage();
    } catch (err) {
      message.textContent = err.message || 'Could not submit this listing.';
    } finally {
      button.disabled = false;
    }
  });

  $('refresh-campus-groups').addEventListener('click', loadCampusGroupsPage);
  $('refresh-campus-events').addEventListener('click', loadCampusEventsPage);
  $('refresh-campus-marketplace').addEventListener('click', loadCampusMarketplacePage);
  $('refresh-campus-content-moderation').addEventListener('click', loadCampusContentModeration);

  $('page-groups').addEventListener('click', async function(event) {
    const groupButton = event.target.closest('[data-campus-group-action]');
    const contentButton = event.target.closest('[data-campus-content-review]');
    const reportButton = event.target.closest('[data-marketplace-report-review]');
    if (groupButton) {
      const action = groupButton.dataset.campusGroupAction;
      const groupId = groupButton.dataset.campusGroupId;
      groupButton.disabled = true;
      try {
        if (action === 'join') await window.CampusShieldBackend.joinCampusGroup(groupId);
        else await window.CampusShieldBackend.leaveCampusGroup(groupId);
        toast(action === 'join' ? 'You joined the campus group.' : 'You left the campus group.');
        await loadCampusGroupsPage();
      } catch (err) {
        toast(err.message || 'Could not update group membership.');
        groupButton.disabled = false;
      }
      return;
    }
    if (contentButton) {
      const decision = contentButton.dataset.campusContentReview;
      const type = contentButton.dataset.campusContentType;
      const id = contentButton.dataset.campusContentId;
      if (!confirm('Are you sure you want to ' + decision + ' this ' + type + '?')) return;
      contentButton.disabled = true;
      try {
        await window.CampusShieldBackend.reviewCampusContent(type,id,decision);
        toast(type.charAt(0).toUpperCase()+type.slice(1)+' '+(decision==='publish'?'approved':'rejected')+'.');
        await loadCampusContentModeration();
        await Promise.all([loadCampusGroupsPage(),loadCampusEventsPage(),loadCampusMarketplacePage()]);
      } catch (err) {
        toast(err.message || 'Could not review this campus content.');
        contentButton.disabled = false;
      }
      return;
    }
    if (reportButton) {
      const decision = reportButton.dataset.marketplaceReportReview;
      const reportId = reportButton.dataset.marketplaceReportId;
      if (!confirm(decision === 'hide_listing' ? 'Hide this listing and mark its report reviewed?' : 'Dismiss this marketplace report?')) return;
      reportButton.disabled = true;
      try {
        await window.CampusShieldBackend.reviewCampusListingReport(reportId,decision);
        toast(decision === 'hide_listing' ? 'Listing hidden and report reviewed.' : 'Marketplace report dismissed.');
        await loadCampusContentModeration();
        await loadCampusMarketplacePage();
      } catch (err) {
        toast(err.message || 'Could not resolve this marketplace report.');
        reportButton.disabled = false;
      }
    }
  });

  $('page-events').addEventListener('click', async function(event) {
    const button = event.target.closest('[data-campus-event-rsvp]');
    if (!button) return;
    button.disabled = true;
    try {
      await window.CampusShieldBackend.setCampusEventRsvp(button.dataset.campusEventId,button.dataset.campusEventRsvp);
      toast(button.dataset.campusEventRsvp === 'going' ? 'You are marked as going.' : 'Marked as interested.');
      await loadCampusEventsPage();
    } catch (err) {
      toast(err.message || 'Could not save your RSVP.');
      button.disabled = false;
    }
  });

  $('page-marketplace').addEventListener('click', async function(event) {
    const soldButton = event.target.closest('[data-marketplace-sold]');
    if (soldButton) {
      if (!confirm('Mark your listing as sold?')) return;
      soldButton.disabled = true;
      try {
        await window.CampusShieldBackend.markCampusListingSold(soldButton.dataset.marketplaceSold);
        toast('Listing marked as sold.');
        await loadCampusMarketplacePage();
      } catch (err) {
        toast(err.message || 'Could not update this listing.');
        soldButton.disabled = false;
      }
      return;
    }
    const button = event.target.closest('[data-marketplace-report]');
    if (!button) return;
    const answer = window.prompt('Why are you reporting this listing?\n1 = Suspected scam\n2 = Spam\n3 = Unsafe item\n4 = Misleading listing\n5 = Harassment\n6 = Other','1');
    if (answer === null) return;
    const reasons = {'1':'scam_suspicion','2':'spam','3':'unsafe_item','4':'misleading_listing','5':'harassment','6':'other'};
    const reason = reasons[String(answer).trim()];
    if (!reason) { toast('Choose a report reason from 1 to 6.'); return; }
    const details = window.prompt('Optional details; do not include private information.','') || '';
    button.disabled = true;
    try {
      await window.CampusShieldBackend.reportCampusListing(button.dataset.marketplaceReport,reason,details.trim());
      toast('Marketplace report sent to your campus moderators.');
      await loadCampusMarketplacePage();
    } catch (err) {
      toast(err.message || 'Could not report this listing.');
      button.disabled = false;
    }
  });

  async function handleSignUp() {
    const backend = window.CampusShieldBackend;
    const email = $('auth-email').value.trim();
    const password = $('auth-password').value;
    const name = $('auth-name').value.trim();
    const username = $('auth-username').value.trim().toLowerCase();
    const requestedRole = $('auth-role').value;
    const universityId = $('auth-university').value;
    const studentNumber = $('identity-student-number').value.trim();
    const studentDocument = $('identity-document').files?.[0];
    const selectedUniversity = $('auth-university').selectedOptions?.[0];
    const institutionName = selectedUniversity ? selectedUniversity.textContent.split(' · ')[0] : '';
    const msg = $('auth-message');
    const isTeacher = requestedRole === 'teacher';

    if (!['student', 'teacher'].includes(requestedRole)) {
      msg.textContent = 'Select Student or Teacher / university staff.';
      return;
    }
    if (!email || !password || !name || !universityId) {
      msg.textContent = 'Enter your name, email, password, and choose your university.';
      return;
    }
    if (!isStrongPasswordBaseline(password)) {
      msg.textContent = 'Choose 12+ characters with uppercase and lowercase letters, at least one number and one symbol. Do not reuse passwords.';
      $('auth-password').focus();
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      msg.textContent = 'Choose a username with 3–20 lowercase letters, numbers, or underscores.';
      return;
    }
    if (!isTeacher && !['auth-faculty','auth-department','auth-course','auth-year-of-study'].every(id => $(id).value.trim())) {
      msg.textContent = 'Complete your faculty, department, course, and level before creating a student account.';
      return;
    }
    if (!isTeacher && (studentNumber.length < 2 || studentNumber.length > 80 || !studentDocument)) {
      msg.textContent = 'Enter your student/matric number and choose a JPEG, PNG, or PDF student ID document.';
      return;
    }
    if (!isTeacher && !$('identity-original-document-confirmation').checked) {
      msg.textContent = 'Confirm that your university-issued document is genuine and has not been AI-generated or digitally altered.';
      return;
    }
    if (isTeacher && !$('auth-staff-position').value) {
      msg.textContent = 'Choose your official position in the university.';
      return;
    }
    if (!backend?.isConfigured) {
      msg.textContent = 'Supabase is not connected. Check configuration and script loading.';
      return;
    }

    const profileData = isTeacher ? {
      requested_role: 'teacher',
      campus_position: $('auth-staff-position').value,
      campus_staff_number: $('auth-staff-number').value.trim(),
      campus_official_email: $('auth-official-email').value.trim(),
      requested_campus_admin: $('auth-request-campus-admin').checked
    } : {
      requested_role: 'student',
      faculty: $('auth-faculty').value.trim(),
      department: $('auth-department').value.trim(),
      course: $('auth-course').value.trim(),
      year_of_study: $('auth-year-of-study').value
    };

    let accountCreated = false;
    try {
      msg.textContent = 'Creating your CampusShield account…';
      const {data, error} = await backend.signUp(email, password, name, username, universityId, profileData);
      if (error) throw error;
      if (!data?.user) throw new Error('Supabase did not return a user.');

      // Supabase intentionally returns a non-error response for an email that already
      // exists, to avoid account enumeration. An empty identities array is the common
      // signal; do not tell the person a new account or email was created.
      const existingAccountResponse = Array.isArray(data.user.identities) && data.user.identities.length === 0;
      if (existingAccountResponse && !data.session) {
        confirmationPending = true;
        $('resend-field').hidden = false;
        msg.textContent = 'This email may already have a CampusShield account. No new account was created. Try Sign in, or use Forgot password if you cannot access it. If you still need confirmation, you can request another email below.';
        return;
      }

      accountCreated = true;

      if (data.session) {
        const result = await backend.saveRequestedRole(requestedRole);
        if (result.error) throw result.error;
        await backend.setMyCampusMembership({
          universityId,
          faculty: profileData.faculty || null,
          department: profileData.department || null,
          course: profileData.course || null,
          yearOfStudy: profileData.year_of_study || null
        });
        if (!isTeacher) {
          try {
            await backend.uploadStudentIdentityDocument(studentDocument, { institutionName, studentNumber, attestOriginalDocument: $('identity-original-document-confirmation').checked });
            studentIdentitySubmission = await backend.getMyStudentIdentityVerification();
            $('identity-document').value = '';
            $('identity-original-document-confirmation').checked = false;
            msg.textContent = 'Account created. Your student ID was uploaded privately and is awaiting administrator review.';
          } catch (uploadError) {
            msg.textContent = 'Account created, but the ID upload did not complete: ' + (uploadError?.message || 'sign in and use Complete student setup to retry.');
          }
        } else {
          msg.textContent = 'Account created. Sign in to submit your staff ID or official university email for administrator review.';
        }
      } else {
        sessionStorage.setItem('campusshield_requested_role', requestedRole);
        confirmationPending = true;
        $('resend-field').hidden = false;
        msg.textContent = isTeacher
          ? 'Account created. Open the confirmation link sent to your email, then return here to sign in and finish staff verification. You can resend the email below.'
          : 'Account created. Open the confirmation link sent to your email, then sign in and choose Complete student setup to securely upload your ID. You can resend the email below.';
      }
    } catch (e) {
      console.error('Sign-up failed:', e);
      if (accountCreated) { msg.textContent = 'Your account was created, but setup needs another step. Sign in and use Complete student setup to submit your ID document.'; return; }
      const errorMessage = String(e.message || '');
      if (/email rate limit exceeded/i.test(errorMessage)) {
        msg.textContent = 'Supabase has temporarily limited confirmation emails. Wait before trying again; repeated sign-up attempts will not speed this up.';
      } else if (/database error saving new user/i.test(errorMessage)) {
        msg.textContent = 'Sign-up failed. That username may already be taken; choose another username and try again.';
      } else {
        msg.textContent = 'Sign-up failed: ' + errorMessage;
      }
    }
  }

  async function handleSignIn() {
    const backend = window.CampusShieldBackend;
    const email = $('auth-email').value.trim();
    const password = $('auth-password').value;
    const msg = $('auth-message');

    if (!email || !password) {
      msg.textContent = 'Enter your email and password.';
      return;
    }

    if (!backend?.isConfigured) {
      msg.textContent = 'Supabase is not connected. Check configuration and script loading.';
      return;
    }

    try {
      msg.textContent = 'Signing in...';

      const {error} = await backend.signIn(email, password);
      if (error) throw error;

      // Read the authenticated user's metadata before restoring the requested role.
      // Email-confirmation links often open in a new tab/device where sessionStorage
      // from the original signup tab is unavailable. Prefer this user's own signup
      // metadata over any stale role left in the browser from a different account.
      const user = await backend.getCurrentUser();
      if (!user) throw new Error('No active user session was found.');

      const metadataRequestedRole = String(user.user_metadata?.requested_role || '').trim().toLowerCase();
      const storedRequestedRole = sessionStorage.getItem('campusshield_requested_role');
      const pendingRole = ['student', 'teacher'].includes(metadataRequestedRole)
        ? metadataRequestedRole
        : storedRequestedRole;

      if (pendingRole && ['student', 'teacher'].includes(pendingRole)) {
        const {error:roleError} = await backend.saveRequestedRole(pendingRole);
        if (roleError) {
          // Old signup state can survive in this browser after an account is verified.
          // A verified/admin account cannot change requested_role; this must not block login.
          if (/only pending accounts can change their requested role/i.test(String(roleError.message || ''))) {
            console.warn('Clearing stale CampusShield signup role state for an existing account.');
            sessionStorage.removeItem('campusshield_requested_role');
          } else {
            throw roleError;
          }
        } else {
          sessionStorage.removeItem('campusshield_requested_role');
        }
      }

      const onboarding = user.user_metadata || {};
      if (onboarding.university_id) {
        await backend.setMyCampusMembership({
          universityId: onboarding.university_id,
          faculty: onboarding.faculty || null,
          department: onboarding.department || null,
          course: onboarding.course || null,
          yearOfStudy: onboarding.year_of_study || null
        });
      }

      const {data:profile, error:profileError} = await backend.client
        .from('profiles')
        .select('role, requested_role, verification_status')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      const desiredRole = selectedSignInRole === 'administrator' ? 'admin' : selectedSignInRole;
      const roleMismatch = selectedSignInRole && profile.role !== desiredRole;
      if (profile.verification_status === 'verified') {
        msg.textContent = roleMismatch
          ? 'Signed in. Your verified account role is ' + profile.role + '; the sign-in choice does not change permissions.'
          : 'Signed in successfully. Your role is ' + profile.role + '.';
      } else if (profile.verification_status === 'rejected') {
        msg.textContent =
          'Your account verification was rejected. Please contact an administrator.';
      } else {
        msg.textContent =
          'Signed in successfully. Your account is pending verification.';
      }

      const workspaceReady = showWorkspace(profile);
            if (workspaceReady) loadCampusDashboardInsights();
            if (workspaceReady && typeof resetShieldMindForSession === 'function') resetShieldMindForSession();
      if (workspaceReady) {
        campusContext = await backend.getMyCampusContext();
        syncCampusAccessNavigation();
        const institutionHint = String($('signin-institution')?.value || '').trim();
        const normalizeInstitution = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (authMode === 'signin' && institutionHint && campusContext?.university_name &&
            normalizeInstitution(institutionHint) !== normalizeInstitution(campusContext.university_name)) {
          toast('Signed in, but your verified campus is ' + campusContext.university_name + '. Your verified campus membership remains authoritative.');
        }
        await refreshIncidentsFromSupabase();
        loadCampusDashboardInsights();
        if (!campusContext?.university_id) {
          clearPendingNotificationPage();
          navigate('community');
          await loadCommunityPage();
          toast('Choose your university to create your private campus space.');
        } else if (isStudentAccount()) {
          navigate('dashboard');
          await loadStudentIdentityStatus();
        } else if (isTeacherAccount() && currentProfile.verification_status !== 'verified') {
          clearPendingNotificationPage();
          navigate('staff-verification');
          await loadCampusStaffVerificationStatus();
        }
      }
    } catch (e) {
      console.error('Sign-in failed:', e);
      msg.textContent = 'Sign-in failed: ' + e.message;
    }
  }

  // Password visibility controls; this only changes the local input display.
  document.querySelectorAll('[data-toggle-password]').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const input = $(toggle.dataset.togglePassword);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      toggle.innerHTML = show
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  });

  // Role choice is only a sign-in hint; it never changes Supabase authorization.
  let selectedSignInRole = 'student';
  document.querySelectorAll('[data-signin-role]').forEach(button => {
    button.addEventListener('click', () => {
      selectedSignInRole = button.dataset.signinRole;
      document.querySelectorAll('[data-signin-role]').forEach(option => {
        option.setAttribute('aria-pressed', String(option === button));
      });
      const note = $('signin-role-note');
      if (note) note.textContent = 'Selected: ' + selectedSignInRole.charAt(0).toUpperCase() + selectedSignInRole.slice(1) + '. Your actual account role and permissions are verified securely after sign-in.';
    });
  });

  $('google-signin-button')?.addEventListener('click', async () => {
    const backend = window.CampusShieldBackend;
    const button = $('google-signin-button');
    const message = $('auth-message');
    const institutionHint = String($('signin-institution')?.value || '').trim();
    if (!isStagingSupabaseEnvironment()) {
      message.textContent = 'Google sign-in is available in the staging preview only. Production has not been changed.';
      return;
    }
    if (!backend?.isConfigured || typeof backend.signInWithGoogle !== 'function') {
      message.textContent = 'Supabase is not configured for Google sign-in.';
      return;
    }
    const oldText = button.textContent.trim();
    button.disabled = true;
    button.textContent = 'Checking Google sign-in…';
    try {
      const providerEnabled = await isGoogleProviderEnabled();
      if (!providerEnabled) {
        message.textContent = 'Google sign-in is not configured in staging yet. Add a Google OAuth Web client ID and secret in Supabase Authentication → Sign In / Providers before retrying.';
        return;
      }
      try {
        sessionStorage.setItem('campusshield_google_oauth_pending', 'true');
        sessionStorage.setItem('campusshield_google_expected_role', selectedSignInRole || 'student');
        sessionStorage.setItem('campusshield_google_institution_hint', institutionHint);
      } catch (_error) {
        message.textContent = 'This browser cannot preserve the sign-in handoff. Enable session storage and try again.';
        return;
      }
      message.textContent = 'Redirecting to Google securely…';
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await backend.signInWithGoogle(redirectTo);
      if (error) throw error;
    } catch (error) {
      try {
        sessionStorage.removeItem('campusshield_google_oauth_pending');
      } catch (_error) {}
      console.error('Google sign-in could not start:', error);
      message.textContent = error?.message || 'Google sign-in could not start. Check the staging OAuth setup and try again.';
    } finally {
      button.disabled = false;
      button.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.96 46.98 31.8 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.88 23.88 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.88 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg> Continue with Google';
    }
  });

  $('auth-form').addEventListener('invalid', event => {
    const target = event.target;
    if (target && target.closest('#signup-fields') && authMode !== 'signup') {
      target.required = false;
      event.preventDefault();
      return;
    }
    const message = $('auth-message');
    if (message && target) message.textContent = 'Please check the highlighted field: ' + (target.labels?.[0]?.textContent || target.getAttribute('aria-label') || target.name || 'required field') + '.';
  }, true);

  $('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (identityCompletionMode) { await submitStudentIdentityDocument(); return; }
    if (authBusy) return;
    // Sign-in should never be blocked by fields belonging to the hidden signup form.
    if (authMode === 'signin') {
      ['auth-name','auth-username','auth-role','auth-university-search','auth-faculty','auth-department','auth-course','auth-year-of-study','auth-staff-position','identity-student-number','identity-document','identity-institution-search'].forEach(function(id) {
        const field = $(id);
        if (field) field.required = false;
      });
    }
    authBusy = true;
    const button = $('auth-submit');
    button.disabled = true;
    button.textContent = authMode === 'signup' ? 'Creating account…' : authMode === 'reset' ? 'Updating password…' : 'Signing in…';
    try {
      if (authMode === 'signup') await handleSignUp();
      else if (authMode === 'reset') await handlePasswordReset();
      else await handleSignIn();
    } catch (error) {
      console.error('Authentication form submission failed:', error);
      $('auth-message').textContent = authMode === 'reset'
        ? 'Could not update the password. The reset link may have expired; request a new one and try again.'
        : 'Could not complete the request. Please try again.';
    } finally {
      authBusy = false;
      button.disabled = false;
      button.textContent = authMode === 'signup' ? 'Create account' : authMode === 'reset' ? 'Update password' : 'Sign in';
    }
  });

  async function loadCampusStaffVerificationStatus() {
    const status = $('staff-verification-status');
    const form = $('campusStaffVerificationForm');
    if (!status || !form || !window.CampusShieldBackend?.isConfigured) return;
    try {
      const user = await window.CampusShieldBackend.getCurrentUser();
      const meta = user?.user_metadata || {};
      $('staff-verification-position').value = meta.campus_position || $('staff-verification-position').value || '';
      $('staff-verification-number').value = meta.campus_staff_number || $('staff-verification-number').value || '';
      $('staff-verification-email').value = meta.campus_official_email || $('staff-verification-email').value || '';
      $('staff-request-campus-admin').checked = Boolean(meta.requested_campus_admin);
      const existing = await window.CampusShieldBackend.getMyCampusStaffVerification();
      currentStaffPosition = String(existing?.position_title || meta.campus_position || '').trim();
      renderRoleAccessSummary(meta);
      if (existing?.status === 'pending') {
        status.textContent = 'Your staff application is pending review. You can use the permitted onboarding screens while waiting.';
        form.hidden = true;
      } else if (existing?.status === 'approved') {
        status.textContent = 'Your staff identity is verified. Campus administrator access, if requested, is a separate appointment.';
        form.hidden = true;
      } else if (existing?.status === 'rejected') {
        status.textContent = 'Your staff application was not approved: ' + (existing.rejection_reason || 'Please correct your evidence and resubmit.');
        form.hidden = false;
      } else {
        status.textContent = 'Submit a staff number, official university email, or staff ID document to begin verification.';
        form.hidden = false;
      }
    } catch (err) {
      status.textContent = err.message || 'Could not load your staff verification status.';
    }
  }

  async function loadCampusIdentityEvidenceAudit() {
    const tbody = $('evidence-audit-rows');
    const message = $('evidence-audit-message');
    if (!tbody || !message) return;
    tbody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
    try {
      const rows = await window.CampusShieldBackend.listCampusIdentityEvidenceChecks();
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6">No evidence review records yet.</td></tr>';
        message.textContent = 'No evidence checks have been recorded for this university.';
        return;
      }
      tbody.innerHTML = rows.map(row => '<tr><td><code>' + esc(row.subject_user_id) + '</code></td><td>' + esc(row.evidence_type) + '</td><td>' + esc(row.outcome) + '</td><td>' + esc(row.source_kind) + (row.source_reference ? '<br>' + esc(row.source_reference) : '') + '</td><td><code>' + esc(row.checked_by) + '</code><br>' + esc(dateText(row.checked_at)) + '</td><td>' + esc(row.reviewer_note || '—') + '</td></tr>').join('');
      message.textContent = rows.length + ' recent evidence check(s).';
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6">Evidence history could not be loaded.</td></tr>';
      message.textContent = err.message || 'Only a verified campus administrator can view this history.';
    }
  }

  async function loadCampusStaffVerificationQueue() {
    const tbody = $('campus-staff-verification-queue');
    const message = $('staff-review-message');
    if (!tbody || !message) return;
    tbody.innerHTML = '<tr><td colspan="5">Loading…</td></tr>';
    try {
      const rows = await window.CampusShieldBackend.listCampusStaffVerificationReviews();
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5">No pending staff applications for this university.</td></tr>';
        message.textContent = 'No applications are waiting for review.';
        return;
      }
      const rendered = [];
      for (const row of rows) {
        let documentLink = '<span class="muted">No document uploaded</span>';
        if (row.document_path) {
          try {
            const signedUrl = await window.CampusShieldBackend.createCampusStaffDocumentUrl(row.document_path);
            if (signedUrl) documentLink = '<a href="' + esc(signedUrl) + '" target="_blank" rel="noopener noreferrer">Open private evidence</a>';
          } catch (err) {
            documentLink = '<span class="muted">Evidence link unavailable</span>';
          }
        }
        const evidence = [row.official_email, row.staff_number ? 'Staff ID: ' + row.staff_number : null].filter(Boolean).map(esc).join('<br>') || '<span class="muted">Details supplied in application</span>';
        rendered.push('<tr><td><strong>@' + esc(row.username || 'staff applicant') + '</strong><br><code>' + esc(row.user_id) + '</code></td>' +
          '<td><strong>' + esc(row.position_title) + '</strong><br>' + evidence + '<br>' + documentLink + '</td>' +
          '<td>' + (row.requested_campus_admin ? '<strong>Requested</strong><br><span class="muted">Requires separate platform-admin appointment</span>' : 'Not requested') + '</td>' +
          '<td>' + esc(dateText(row.created_at)) + '</td>' +
          '<td><div class="actions"><button type="button" class="btn secondary" data-evidence-check data-staff-user="' + esc(row.user_id) + '">Record evidence check</button><button type="button" class="btn" data-staff-review="approve" data-staff-user="' + esc(row.user_id) + '">Approve staff</button><button type="button" class="btn danger" data-staff-review="reject" data-staff-user="' + esc(row.user_id) + '">Reject</button></div></td></tr>');
      }
      tbody.innerHTML = rendered.join('');
      message.textContent = rows.length + ' pending staff application(s). Verify the evidence and university position before deciding.';
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5">Staff applications could not be loaded.</td></tr>';
      message.textContent = err.message || 'Only a verified campus administrator can load this queue.';
    }
  }

  $('campusStaffVerificationForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('staff-verification-submit');
    const status = $('staff-verification-status');
    const documentFile = $('staff-verification-document').files?.[0] || null;
    button.disabled = true;
    status.textContent = 'Uploading evidence privately and submitting your application…';
    try {
      await window.CampusShieldBackend.submitCampusStaffVerification({
        positionTitle: $('staff-verification-position').value.trim(),
        staffNumber: $('staff-verification-number').value.trim(),
        officialEmail: $('staff-verification-email').value.trim(),
        requestedCampusAdmin: $('staff-request-campus-admin').checked,
        document: documentFile
      });
      $('staff-verification-document').value = '';
      status.textContent = 'Staff verification submitted. Your application is pending review by an authorized administrator at your university.';
      await loadCampusStaffVerificationStatus();
    } catch (err) {
      status.textContent = err.message || 'Could not submit staff verification.';
    } finally {
      button.disabled = false;
    }
  });

  $('campus-staff-verification-queue').addEventListener('click', async event => {
    const evidenceButton = event.target.closest('[data-evidence-check]');
    if (evidenceButton) {
      const userId = evidenceButton.dataset.staffUser;
      const typeChoice = prompt('Evidence type: 1 = Staff ID, 2 = Payment receipt', '1');
      const typeMap = { '1': 'staff_id', '2': 'payment_receipt' };
      const evidenceType = typeMap[String(typeChoice || '').trim()];
      if (!evidenceType) { toast('Choose evidence type 1 or 2.'); return; }
      const outcomeChoice = prompt('Outcome: 1 = Needs review, 2 = Institution confirmed, 3 = Not confirmed', '1');
      const outcomeMap = { '1': 'needs_review', '2': 'institution_confirmed', '3': 'not_confirmed' };
      const outcome = outcomeMap[String(outcomeChoice || '').trim()];
      if (!outcome) { toast('Choose outcome 1, 2, or 3.'); return; }
      const sourceChoice = prompt('Source: 1 = Visual document review, 2 = Official university email, 3 = University registry, 4 = Direct institution contact, 5 = Official payment portal, 6 = Other', '1');
      const sourceMap = { '1': 'document_visual_review', '2': 'official_university_email', '3': 'university_registry', '4': 'direct_institution_contact', '5': 'official_payment_portal', '6': 'other' };
      const sourceKind = sourceMap[String(sourceChoice || '').trim()];
      if (!sourceKind) { toast('Choose source 1–6.'); return; }
      const sourceReference = prompt('Source reference (required for institution confirmation; never enter passwords or private secrets):', '') || '';
      if (outcome === 'institution_confirmed' && (!['official_university_email','university_registry','direct_institution_contact','official_payment_portal'].includes(sourceKind) || !sourceReference.trim())) {
        toast('Institution confirmation requires an authoritative source and traceable reference.');
        return;
      }
      const reviewerNote = prompt('Reviewer note (optional; do not include unnecessary sensitive information):', '') || '';
      evidenceButton.disabled = true;
      try {
        await window.CampusShieldBackend.recordCampusIdentityEvidenceCheck({ userId, evidenceType, outcome, sourceKind, sourceReference: sourceReference.trim() || null, reviewerNote: reviewerNote.trim() || null });
        toast('Evidence check recorded in the university audit history.');
        await loadCampusIdentityEvidenceAudit();
      } catch (err) {
        toast(err.message || 'Could not record evidence check.');
        evidenceButton.disabled = false;
      }
      return;
    }
    const button = event.target.closest('[data-staff-review]');
    if (!button) return;
    const decision = button.dataset.staffReview;
    const reason = decision === 'reject' ? prompt('Give the staff applicant a reason (5–1000 characters):') : null;
    if (decision === 'reject' && (!reason || reason.trim().length < 5)) {
      toast('Enter a rejection reason of at least 5 characters.');
      return;
    }
    button.disabled = true;
    try {
      await window.CampusShieldBackend.reviewCampusStaffVerification(button.dataset.staffUser, decision, reason?.trim() || null);
      toast(decision === 'approve' ? 'Staff identity approved.' : 'Staff application rejected.');
      await loadCampusStaffVerificationQueue();
    } catch (err) {
      toast(err.message || 'Could not review staff application.');
      button.disabled = false;
    }
  });

  $('refresh-staff-verification-queue').addEventListener('click', loadCampusStaffVerificationQueue);
  $('refresh-evidence-audit')?.addEventListener('click', loadCampusIdentityEvidenceAudit);
  document.querySelectorAll('[data-page="staff-review"]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.page === 'staff-review') loadCampusStaffVerificationQueue();
  }));
  document.querySelectorAll('[data-page="staff-verification"]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.page === 'staff-verification') loadCampusStaffVerificationStatus();
  }));


  function markCampusWelcomeTourSeen() {
    try { localStorage.setItem('campusshield-welcome-tour-v1', 'seen'); } catch (_) {}
  }
  function openCampusWelcomeTour(force = false) {
    const dialog = $('campus-welcome-tour');
    if (!dialog || dialog.open) return;
    if (!force) {
      try { if (localStorage.getItem('campusshield-welcome-tour-v1') === 'seen') return; } catch (_) {}
    }
    if (typeof dialog.showModal === 'function') dialog.showModal();
  }
  function maybeShowCampusWelcomeTour() {
    const dialog = $('campus-welcome-tour');
    if (!dialog || dialog.open) return;
    try { if (localStorage.getItem('campusshield-welcome-tour-v1') === 'seen') return; } catch (_) {}
    if (typeof dialog.showModal === 'function') dialog.showModal();
  }
  $('campus-tour-close')?.addEventListener('click', () => { markCampusWelcomeTourSeen(); $('campus-welcome-tour')?.close(); });
  $('campus-tour-finish')?.addEventListener('click', () => { markCampusWelcomeTourSeen(); $('campus-welcome-tour')?.close(); });
  $('campus-welcome-tour')?.addEventListener('cancel', markCampusWelcomeTourSeen);
  $('open-campus-tour')?.addEventListener('click', () => openCampusWelcomeTour(true));
  document.querySelectorAll('[data-campus-tour-page]').forEach(button => button.addEventListener('click', () => {
    const page = button.dataset.campusTourPage;
    if (['community','noticeboard'].includes(page) && currentProfile?.verification_status !== 'verified') {
      markCampusWelcomeTourSeen();
      $('campus-welcome-tour')?.close();
      toast('CampusPulse and verified campus notices are available after account verification.');
      return;
    }
    markCampusWelcomeTourSeen();
    $('campus-welcome-tour')?.close();
    navigate(page);
  }));
  document.querySelectorAll('[data-campus-pulse-prompt]').forEach(button => button.addEventListener('click', () => {
    if (!currentProfile) { showLogin('Please sign in to use CampusPulse.'); return; }
    const postType = $('community-post-type');
    const titleInput = $('community-post-title-input');
    const composer = $('communityPostForm');
    if (postType) postType.value = button.dataset.campusPulsePrompt || 'campus_update';
    if (composer) composer.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
    if (titleInput) titleInput.focus({preventScroll:true});
    if ($('community-post-message')) $('community-post-message').textContent = 'Ready to share. Keep posts helpful and public-safe; sensitive safety concerns belong in private incident reporting.';
  }));

  $('reportForm').addEventListener('submit', async e => {
    e.preventDefault();

    const backend = window.CampusShieldBackend;
    const submitButton = $('report-submit');
    const submitStatus = $('report-submit-status');

    if (!backend?.isConfigured) {
      if (submitStatus) { submitStatus.dataset.state = 'error'; submitStatus.textContent = 'Supabase is not configured. This report has not been saved.'; }
      toast('Supabase is not configured.');
      return;
    }

    if (submitButton.disabled) return;
    const reportSummary = [
      'Submit this report to your CampusShield campus workspace for review?',
      '',
      'Category: ' + $('category').value,
      'Severity: ' + $('severity').value,
      'Location: ' + $('location').value.trim(),
      '',
      'This saves a report for review. It does NOT contact emergency services or dispatch help.',
      'For immediate danger, contact campus security or local emergency services directly.'
    ].join('\n');
    if (!window.confirm(reportSummary)) {
      if (submitStatus) { submitStatus.dataset.state = ''; submitStatus.textContent = 'Submission cancelled. Your report has not been sent.'; }
      return;
    }
    if (submitStatus) { submitStatus.dataset.state = ''; submitStatus.textContent = 'Submitting your report securely…'; }
    submitButton.disabled = true;
    submitButton.textContent = 'Saving report…';

    try {
      const saved = await backend.createIncident({
        category: $('category').value,
        severity: $('severity').value,
        location: $('location').value.trim(),
        description: $('description').value.trim()
      });

      incidents.unshift({
        id: saved.id,
        category: saved.category,
        severity: normalizeSeverity(saved.severity),
        location: saved.location,
        description: saved.description,
        status: normalizeStatus(saved.status),
        createdAt: saved.created_at
      });

      $('reportForm').reset();
      render();
      if (submitStatus) {
        submitStatus.dataset.state = 'success';
        submitStatus.textContent = 'Report saved successfully to your CampusShield workspace. Reference: ' + String(saved.id || 'created').slice(0, 12) + '. Your report is awaiting review; emergency services have not been contacted.';
      }
      toast('Incident saved to Supabase. Emergency services have not been contacted.');
    } catch (err) {
      console.error('Incident submission failed:', err);
      if (submitStatus) { submitStatus.dataset.state = 'error'; submitStatus.textContent = 'Could not save this report. Nothing has been confirmed as saved. Please check your connection and try again.'; }
      toast('Could not save report: ' + err.message);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit report';
    }
  });

  $('riskForm').addEventListener('submit', e => {
    e.preventDefault();

    const t = +$('riskType').value;
    const p = +$('riskPeople').value;
    const u = +$('riskUrgency').value;
    const v = +$('riskEnvironment').value;

    const weightedScore = t * 4 + p * 3 + u * 5 + v * 2;
    const score = Math.round((weightedScore - 18) / (58 - 18) * 100);

    const band = score >= 75 ? 'Critical priority'
      : score >= 50 ? 'High priority'
      : score >= 30 ? 'Moderate priority'
      : 'Lower priority';

    $('riskOutput').textContent =
      `${band}: ${score}/100. Illustrative triage score only, not a probability or validated prediction. Follow official emergency procedures for urgent situations.`;
  });

  $('exportCsv').addEventListener('click', () => {
    if (!incidents.length) {
      toast('No incident records to export.');
      return;
    }

    const cols = [
      'id', 'category', 'severity', 'location',
      'description', 'status', 'createdAt'
    ];

    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';

    const csv = [
      cols.join(','),
      ...incidents.map(i => cols.map(c => q(i[c])).join(','))
    ].join('\r\n');

    const url = URL.createObjectURL(
      new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8;'})
    );

    const a = document.createElement('a');
    a.href = url;
    a.download = 'campusshield-incidents.csv';
    a.click();

    URL.revokeObjectURL(url);
  });


  // Remember the email address, never the password.
  const emailInput = $('auth-email');
  const rememberCheckbox = $('remember-email');

  try {
    const savedEmail = localStorage.getItem('campusshield_saved_email');

    if (savedEmail) {
      emailInput.value = savedEmail;
      rememberCheckbox.checked = true;
    }
  } catch (err) {
    console.warn('Email remembering is unavailable in this browser.');
  }

  function saveEmailPreference() {
    try {
      if (rememberCheckbox.checked) {
        localStorage.setItem(
          'campusshield_saved_email',
          emailInput.value.trim()
        );
      } else {
        localStorage.removeItem('campusshield_saved_email');
      }
    } catch (err) {
      console.warn('Could not save email preference.');
    }
  }

  emailInput.addEventListener('input', saveEmailPreference);
  rememberCheckbox.addEventListener('change', saveEmailPreference);

$('resend-confirmation-button').addEventListener('click', async () => {
  const backend = window.CampusShieldBackend;
  const email = $('auth-email').value.trim();
  const msg = $('auth-message');
  const button = $('resend-confirmation-button');

  if (!email) {
    msg.textContent = 'Enter your email address first.';
    $('auth-email').focus();
    return;
  }

  if (!backend?.isConfigured) {
    msg.textContent = 'Supabase is not connected.';
    return;
  }

  button.disabled = true;

  try {
    msg.textContent = 'Sending confirmation email...';

    const { error } = await backend.resendConfirmation(email);

    if (error) throw error;

    msg.textContent =
      'If this account requires confirmation, a new email has been requested. Check your inbox and spam folder.';
  } catch (error) {
    console.error('Resend confirmation failed:', error);

    msg.textContent = /email rate limit exceeded/i.test(String(error.message || ''))
      ? 'Supabase has temporarily limited confirmation emails. Please wait before trying again; repeated resend requests will not speed this up.'
      : 'Could not request another email. Please wait and try again later.';
  } finally {
    button.disabled = false;
  }
});

  // Keep render() as the app's rendering function.
  $('approvals-nav').hidden = true;
  setAuthMode('signin');

  render();
  if (passwordRecoveryActive) {
    $('workspace').hidden = true;
    $('login-screen').hidden = false;
    setAuthMode('reset');
    $('auth-message').textContent = 'Your reset link is ready. Choose a new password below.';
  } else {
    showLogin();
  }

  // Surface Supabase confirmation-link errors instead of silently returning to sign-in.
  // Supabase may return these in the query string or URL fragment.
  const confirmationQuery = new URLSearchParams(window.location.search);
  const confirmationHash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  const confirmationError = confirmationQuery.get('error_description') || confirmationHash.get('error_description');
  if (confirmationError) {
    confirmationPending = true;
    $('resend-field').hidden = false;
    const normalizedConfirmationError = confirmationError.toLowerCase();
    $('auth-message').textContent = /expired|invalid|otp/i.test(normalizedConfirmationError)
      ? 'That email link has expired or was already used. Enter your email and choose Resend confirmation email to get a fresh link.'
      : 'The email confirmation link could not be completed. Request a fresh confirmation email below.';
    try { window.history.replaceState({}, document.title, window.location.pathname); } catch (_urlError) {}
  }

  (async () => {
    try {
      const backend = window.CampusShieldBackend;
      if (backend?.isConfigured) {
        const user = await backend.getCurrentUser();
        if (user) {
          const {data:profile, error} = await backend.client
            .from('profiles')
            .select('role, requested_role, verification_status')
            .eq('id', user.id)
            .single();
          if (!error && profile) {
            if (passwordRecoveryActive) {
              $('workspace').hidden = true;
              $('login-screen').hidden = false;
              setAuthMode('reset');
              $('auth-message').textContent = 'Your reset link is ready. Choose a new password below.';
              return;
            }
            const workspaceReady = showWorkspace(profile);
            if (workspaceReady) {
              campusContext = await backend.getMyCampusContext();
              syncCampusAccessNavigation();
              const completedGoogleOAuth = consumeGoogleOAuthHints(profile, campusContext);
              await refreshIncidentsFromSupabase();
              if (!completedGoogleOAuth) {
                $('auth-message').textContent = profile.verification_status === 'verified'
                  ? `Signed in. Your role is ${profile.role}.`
                  : 'Your account is pending verification. You can submit incident reports.';
              }
              // Always restore signed-in sessions to Overview after a fresh visit or refresh.
              // CampusPulse/university selection remains available through its own navigation item.
              navigate('dashboard');
              if (isStudentAccount()) {
                await loadStudentIdentityStatus();
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Could not restore previous session:', err.message);
    }
  })();

  if (!window.CampusShieldBackend) {
    console.error(
      'CampusShieldBackend is undefined. Check script paths and loading order.'
    );
  } else {
    console.log(
      'CampusShieldBackend loaded:',
      typeof window.CampusShieldBackend.signIn,
      'Configured:',
      window.CampusShieldBackend.isConfigured
    );
  }
  
  let shieldMindSessionUserId = null, shieldMindHistory = [], shieldMindRecentQuestions = [];
  function resetShieldMindForSession() {
    if (!currentProfile) { shieldMindSessionUserId=null; shieldMindHistory=[]; shieldMindRecentQuestions=[]; renderShieldMindRecentQuestions(); return; }
    // Let all signed-in accounts ask general academic questions. The backend independently
    // blocks campus-specific and sensitive actions when the account is not eligible.
    const allowed=true;
    if ($('shieldmind-submit')) $('shieldmind-submit').disabled=false;
    if (shieldMindSessionUserId!==currentProfile.id) {
      shieldMindSessionUserId=currentProfile.id;
      shieldMindHistory=[];
      shieldMindRecentQuestions=[];
      renderShieldMindRecentQuestions();
      if ($('shieldmind-messages')) $('shieldmind-messages').innerHTML='<article class="shieldmind-message assistant"><strong>ShieldMind AI</strong><p>Chat ready. Ask a general academic question. Official campus details are only answered when approved campus sources support them.</p></article>';
    }
    if ($('shieldmind-status')) $('shieldmind-status').textContent='Ready for a general academic question.';
  }

  async function reconcileReturnedPaystackPayment() {
    const message = $('billing-payment-message');
    const button = $('billing-reconcile-button');
    const backend = window.CampusShieldBackend;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!message || !button) return;
    const stagingBilling = isStagingSupabaseEnvironment();
    const validReference = stagingBilling ? /^sm_[a-f0-9]{32}$/i.test(reference || "") : /^csa_[a-f0-9]{32}$/i.test(reference || "");
    if (!reference || !validReference) {
      message.textContent = 'The payment return does not contain a valid transaction reference. Check your plan status before trying another payment.';
      button.hidden = true;
      return;
    }
    if (!backend?.client || !currentProfile) {
      message.textContent = 'Sign in with the same CampusShield account used at checkout, then choose Verify payment status.';
      button.hidden = false;
      return;
    }
    button.hidden = false;
    button.disabled = true;
    button.textContent = 'Verifying payment…';
    message.textContent = 'Verifying the transaction with Paystack and reconciling your subscription securely…';
    try {
      const reconcileFunction = stagingBilling ? 'shieldmind-billing-reconcile' : 'paystack-reconcile';
      const {data, error} = await backend.client.functions.invoke(reconcileFunction, {
        body: { reference }
      });
      if (error) throw new Error('The server could not confirm the payment yet. Retry verification before starting another checkout.');
      if (data?.activated === true && data?.verified === true) {
        message.textContent = data?.duplicate
          ? 'Payment verified. Your ShieldMind plan is already active.'
          : 'Payment verified and your ShieldMind plan is active for 30 days.';
        button.hidden = true;
        const cleanUrl = new URL(window.location.href);
        ['billing','reference','trxref'].forEach(key => cleanUrl.searchParams.delete(key));
        window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
        await refreshShieldMindPlan();
      } else if (data?.action_required === true) {
        message.textContent = data?.message || 'Payment verified, but a newer subscription was preserved. Contact CampusShield support before making another payment.';
        button.disabled = true;
      } else {
        message.textContent = data?.message || 'Paystack has not confirmed a successful payment yet. You can retry verification; do not start another checkout while this one is pending.';
      }
    } catch (error) {
      message.textContent = error?.message || 'Could not verify payment right now. Retry verification before starting another checkout.';
    } finally {
      if (!button.hidden) {
        button.disabled = false;
        button.textContent = 'Retry payment verification';
      }
    }
  }

  async function refreshShieldMindPlan() {
    const status = $('shieldmind-plan-status');
    if (!status) return;
    const backend = window.CampusShieldBackend;
    if (!currentProfile || !backend?.isConfigured) { status.textContent='Sign in to view your plan. ShieldMind and subscription information are available to every signed-in user.'; return; }
    status.textContent='Checking your plan…';
    try {
      const {data:{user},error:userError}=await backend.client.auth.getUser();
      if (userError || !user) { status.textContent='Sign in to view or upgrade your plan.'; return; }
      const {data,error}=await backend.client.from('shieldmind_subscriptions')
        .select('plan,status,expires_at').eq('user_id',user.id).maybeSingle();
      if (error) throw error;
      const active=Boolean(data && ['starter','plus','pro','ultra','max','premium'].includes(data.plan) &&
        data.status==='active' && data.expires_at && new Date(data.expires_at).getTime()>Date.now());
      document.querySelectorAll('[data-billing-plan]').forEach(button=>{ button.disabled=false; });
      status.textContent=active
        ? data.plan.toUpperCase()+' active until '+new Date(data.expires_at).toLocaleDateString()+'. Your tier limits are enabled.'
        : 'You are on ShieldMind Free. Visit Subscriptions & billing to compare paid plans. Payment must be confirmed by the server before Premium activates.';
      const billingStatus=$('billing-ai-status');
      if(billingStatus) billingStatus.textContent=active
        ? data.plan.toUpperCase()+' active until '+new Date(data.expires_at).toLocaleDateString()+'.'
        : 'Current plan: Free. Paid access activates only after Paystack payment is independently verified.';
    } catch (_error) {
      status.textContent='Plan status could not be loaded. Your AI can still be used within Free-tier server limits.';
      const billingStatus=$('billing-ai-status');
      if(billingStatus) billingStatus.textContent='Plan status is temporarily unavailable. Paid access cannot be granted without a verified server-side payment.';
    }
  }
  function addShieldMindMessage(role,message) {
    const article=document.createElement('article'); article.className='shieldmind-message '+(role==='user'?'user':'assistant');
    const title=document.createElement('strong'); title.textContent=role==='user'?'You':'ShieldMind AI';
    const body=document.createElement('p'); body.textContent=message; article.append(title,body);
    $('shieldmind-messages').appendChild(article); $('shieldmind-messages').scrollTop=$('shieldmind-messages').scrollHeight;
  }
  function renderShieldMindRecentQuestions() {
    const list=$('shieldmind-recent-list');
    if(!list) return;
    list.replaceChildren();
    const recent=shieldMindRecentQuestions.slice(0,5);
    if(!recent.length) {
      const empty=document.createElement('p');
      empty.className='shieldmind-recent-empty';
      empty.textContent='Your recent questions will appear here during this session.';
      list.appendChild(empty);
      return;
    }
    recent.forEach(question=>{
      const item=document.createElement('button');
      item.type='button';
      item.className='shieldmind-recent-item';
      item.setAttribute('aria-label','Reuse previous question: '+question);
      const label=document.createElement('span');
      label.textContent=question;
      item.appendChild(label);
      item.addEventListener('click',()=>{
        $('shieldmind-question').value=question;
        $('shieldmind-question').focus();
        document.querySelectorAll('#page-shieldmind .shieldmind-quick-action').forEach(action=>action.classList.toggle('is-active',action.hasAttribute('data-shieldmind-focus-chat')));
      });
      list.appendChild(item);
    });
  }
  function setShieldMindQuickActionActive(button) {
    const bar=button?.closest('.shieldmind-quick-actions');
    if(!bar) return;
    bar.querySelectorAll('.shieldmind-quick-action').forEach(action=>action.classList.toggle('is-active',action===button));
  }
  document.querySelectorAll('[data-shieldmind-focus-chat]').forEach(button=>button.addEventListener('click',()=>{
    setShieldMindQuickActionActive(button);
    $('shieldmind-question').focus();
    $('shieldmind-question').scrollIntoView({behavior:'smooth',block:'center'});
  }));
  document.querySelectorAll('[data-shieldmind-scroll-tools]').forEach(button=>button.addEventListener('click',()=>{
    setShieldMindQuickActionActive(button);
    $('shieldmind-study-tools')?.scrollIntoView({behavior:'smooth',block:'center'});
  }));
  document.querySelectorAll('[data-shieldmind-focus-image]').forEach(button=>button.addEventListener('click',()=>{
    setShieldMindQuickActionActive(button);
    const details=document.querySelector('#page-shieldmind .shieldmind-upload-details');
    if(details) details.open=true;
    $('shieldmind-image')?.click();
  }));
  $('shieldmind-recent-clear')?.addEventListener('click',()=>{
    shieldMindRecentQuestions=[];
    renderShieldMindRecentQuestions();
    $('shieldmind-status').textContent='Recent questions cleared for this session.';
  });
  $('shieldmind-clear').addEventListener('click',()=>{
    shieldMindHistory=[];
    shieldMindRecentQuestions=[];
    renderShieldMindRecentQuestions();
    $('shieldmind-messages').innerHTML='';
    addShieldMindMessage('assistant','Chat cleared. Official campus policy answers remain unavailable until approved sources are configured.');
    $('shieldmind-status').textContent='Chat cleared. This interface does not save your conversation.';
  });
  document.querySelectorAll('[data-shieldmind-prompt]').forEach(button=>button.addEventListener('click',()=>{
    $('shieldmind-question').value=button.dataset.shieldmindPrompt;
    $('shieldmind-question').focus();
    setShieldMindQuickActionActive(button);
    const quick=button.closest('.shieldmind-quick-actions');
    if(quick) $('shieldmind-question').scrollIntoView({behavior:'smooth',block:'center'});
  }));
  $('shieldmind-form').addEventListener('submit',async event=>{
    event.preventDefault(); const question=String($('shieldmind-question').value||'').trim(),backend=window.CampusShieldBackend,imageFile=$('shieldmind-image')?.files?.[0]||null;
    const allowed=Boolean(currentProfile);
    if(!question||question.length>1200)return;
    if (!backend?.isConfigured) { $('shieldmind-status').textContent='ShieldMind backend is unavailable. Please try again later.'; return; }
    if(imageFile && !['image/jpeg','image/png','image/webp'].includes(imageFile.type)){$('shieldmind-status').textContent='Use a JPG, PNG or WebP study image.';return;}
    if(imageFile && imageFile.size>2.5*1024*1024){$('shieldmind-status').textContent='The image must be 2.5 MB or smaller.';return;}
    if(imageFile && !$('shieldmind-image-confirm')?.checked){$('shieldmind-status').textContent='Confirm that the image contains only academic material and no private personal information.';return;}
    if(!backend?.isConfigured||!allowed){$('shieldmind-status').textContent='Sign in to use ShieldMind.';return;}
    const {data:{user},error:userError}=await backend.client.auth.getUser();
    if(userError||!user){$('shieldmind-status').textContent='Your session could not be confirmed. Sign in again.';return;}
    if (!currentProfile.id) currentProfile={...currentProfile,id:user.id};
    const profileAtRequest=currentProfile,userId=user.id,button=$('shieldmind-submit');
    if (currentProfile.id !== userId) { $('shieldmind-status').textContent='Your session and account profile do not match. Please sign in again.'; return; }
    shieldMindSessionUserId=user.id;
    button.disabled=true;$('shieldmind-status').textContent='ShieldMind is checking your request…';addShieldMindMessage('user',question);$('shieldmind-question').value='';
    try{
      let imagePayload=null;
      if(imageFile){
        imagePayload=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const dataUrl=String(reader.result||'');const split=dataUrl.indexOf(',');if(split<0){reject(new Error('Image could not be prepared.'));return;}resolve({mime_type:imageFile.type,data_base64:dataUrl.slice(split+1)});};reader.onerror=()=>reject(new Error('Image could not be read.'));reader.readAsDataURL(imageFile);});
      }
      const result=await backend.askShieldMind(question,shieldMindHistory,imagePayload);
      if($('shieldmind-image')) $('shieldmind-image').value='';
      if($('shieldmind-image-confirm')) $('shieldmind-image-confirm').checked=false;
      if(currentProfile!==profileAtRequest||currentProfile?.id!==userId){shieldMindHistory=[];$('shieldmind-messages').innerHTML='';resetShieldMindForSession();return;}
      addShieldMindMessage('assistant',String(result?.answer||'I could not produce an answer.'));
      shieldMindHistory.push({role:'user',content:question},{role:'assistant',content:String(result?.answer||'')});shieldMindHistory=shieldMindHistory.slice(-8);
      shieldMindRecentQuestions=[question,...shieldMindRecentQuestions.filter(item=>item!==question)].slice(0,5);
      renderShieldMindRecentQuestions();
      $('shieldmind-status').textContent=result?.mode==='provider'?'Study support · Verify important facts against your course materials.':'Safe response · official campus sources are not connected, so verify important facts with your course materials.';
    }catch(error){
      const detail=String(error?.message||'').trim();
      const friendlyMessage=detail&&!/Edge Function returned a non-2xx status code/i.test(detail)
        ? detail
        : 'ShieldMind is temporarily unavailable. Please try again later.';
      console.warn('ShieldMind request failed:',friendlyMessage);
      $('shieldmind-status').textContent=friendlyMessage;
      addShieldMindMessage('assistant',friendlyMessage+' For urgent campus or safety matters, use official university channels.');
    }
    finally{button.disabled=false;}
  });


  async function openIdentityCompletionView() {
    const backend = window.CampusShieldBackend;
    if (!currentProfile || !isStudentAccount() || !backend?.isConfigured) return;
    try {
      campusContext = await backend.getMyCampusContext();
      identityCompletionMode = true;
      $('workspace').hidden = true;
      $('login-screen').hidden = false;
      setAuthMode('signup');
      $('auth-message').textContent = 'Choose your student ID document and matric number below. Your university is locked to your account.';
      $('identity-institution-search').value = campusContext?.university_name || '';
      $('identity-institution').value = campusContext?.university_name || '';
      await loadStudentIdentityStatus();
      if (studentIdentitySubmission?.status === 'pending' || studentIdentitySubmission?.status === 'approved') closeIdentityCompletionView();
    } catch (err) {
      identityCompletionMode = false;
      $('auth-message').textContent = err?.message || 'Could not open student setup.';
      $('workspace').hidden = false;
      $('login-screen').hidden = true;
    }
  }
  function closeIdentityCompletionView() {
    identityCompletionMode = false;
    $('login-screen').hidden = true;
    $('workspace').hidden = false;
    setAuthMode('signin');
    syncIdentityNavigation();
    navigate('dashboard');
  }
  $('student-identity-setup-button').addEventListener('click', openIdentityCompletionView);

  document.querySelector('.mobile-sidebar-signout')?.addEventListener('click', () => {
    $('signout-button')?.click();
  });

  $('signout-button').addEventListener('click', async () => {
    stopCampusChatRealtime();
    clearCampusDirectMessageState();
    try {
      const backend = window.CampusShieldBackend;
      if (!backend?.client) {
        throw new Error('Supabase client is unavailable.');
      }

      const {error} = await backend.client.auth.signOut();
      if (error) throw error;
      $('auth-password').value = '';
      currentProfile = null;
      showLogin('You have signed out.');
      toast('Signed out successfully.');
    } catch (err) {
      $('auth-message').textContent = 'Sign-out failed: ' + err.message;
    }
  });

})();
