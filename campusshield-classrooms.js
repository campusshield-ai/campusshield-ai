/* CampusShield AI Classrooms — staging prototype.
   Database permissions are enforced by Supabase RLS and checked RPC functions. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const backend = () => window.CampusShieldBackend;
  let selectedClass = null;
  let currentProfile = null;
  let currentSession = null;

  const style = document.createElement("style");
  style.textContent = `
    .classroom-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:13px}
    .classroom-card{border:1px solid #e2eae6;border-radius:15px;padding:17px;background:#fff}
    .classroom-card h3{margin:0 0 5px;color:#173b43;font-size:15px}
    .classroom-card p{margin:4px 0;color:#71828a;font-size:11px}
    .classroom-code{display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border-radius:9px;background:#eef7f3;color:#1f6d5b;font-weight:850;letter-spacing:.08em}
    .classroom-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
    .classroom-roster{display:grid;gap:8px}
    .classroom-person{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px;border:1px solid #e8efeb;border-radius:10px;font-size:12px}
    .classroom-person strong{color:#2c4850}
    .classroom-subtitle{margin:0 0 12px;font-size:14px;color:#203b43}
    .classroom-entry{border:1px solid #e7eeea;border-radius:12px;padding:12px;margin:9px 0}
    .classroom-entry strong{display:block;color:#2a464d;font-size:12px}
    .classroom-entry p{white-space:pre-wrap;overflow-wrap:anywhere;color:#657a80;font-size:12px;margin:7px 0}
    .classroom-small{font-size:10px;color:#829095}
    .classroom-attendance-row{display:grid;grid-template-columns:minmax(0,1fr) 130px auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #edf1ef}
    .classroom-attendance-row select{width:100%;border:1px solid #d9e4df;border-radius:8px;padding:8px;background:#fff}
    @media(max-width:750px){.classroom-split{grid-template-columns:1fr}.classroom-attendance-row{grid-template-columns:1fr 110px}.classroom-attendance-row button{grid-column:1/-1}}
  `;
  document.head.appendChild(style);

  const nav = document.querySelector(".nav");
  if (nav && !document.querySelector('[data-page="classrooms"]')) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.page = "classrooms";
    button.id = "classrooms-nav";
    button.hidden = true;
    button.innerHTML = '<span class="nav-icon" aria-hidden="true">▦</span>Classrooms';
    const community = document.getElementById("community-nav");
    if (community) community.insertAdjacentElement("afterend", button);
    else nav.appendChild(button);
  }

  const content = document.querySelector("main.content");
  if (content && !$("page-classrooms")) {
    const section = document.createElement("section");
    section.className = "page";
    section.id = "page-classrooms";
    section.innerHTML = `
      <div class="heading"><div><h1>My Classrooms</h1><p>Teacher-led classes, class assistants, learning materials, and attendance — in one place.</p></div></div>
      <div class="notice-inline"><strong>Staging preview.</strong> Use fictional accounts and test data. A verified teacher creates classes; verified students join using a class code. Class assistants can help record attendance, but cannot appoint themselves or change roles.</div>
      <div id="classroom-role-note" class="message" role="status" aria-live="polite">Checking your classroom access…</div>
      <div class="classroom-split">
        <section class="panel" id="classroom-create-panel" hidden>
          <div class="panel-heading"><div><h2>Create a class</h2><p>Only verified teachers can create classes.</p></div></div>
          <form id="classroom-create-form">
            <div class="field"><label for="classroom-name">Class name *</label><input id="classroom-name" required minlength="3" maxlength="120" placeholder="e.g. Introduction to IT"></div>
            <div class="field"><label for="classroom-subject">Subject / course *</label><input id="classroom-subject" required minlength="2" maxlength="120" placeholder="e.g. IT 204"></div>
            <div class="field"><label for="classroom-description">Description</label><textarea id="classroom-description" maxlength="1000" placeholder="What students will use this class for"></textarea></div>
            <button class="btn" id="classroom-create-button" type="submit">Create class and generate code</button>
          </form>
        </section>
        <section class="panel" id="classroom-join-panel" hidden>
          <div class="panel-heading"><div><h2>Join a class</h2><p>Enter the code shared by your teacher.</p></div></div>
          <form id="classroom-join-form">
            <div class="field"><label for="classroom-join-code">Class code *</label><input id="classroom-join-code" required minlength="6" maxlength="20" autocapitalize="characters" placeholder="CSAI-1A2B3C"></div>
            <button class="btn" id="classroom-join-button" type="submit">Join class</button>
          </form>
        </section>
      </div>
      <section class="panel"><div class="panel-heading"><div><h2>My classes</h2><p>Only classes your account is authorized to access appear here.</p></div><button class="btn secondary" type="button" id="classroom-refresh">Refresh</button></div><div id="classroom-list" class="classroom-grid"><div class="empty">Loading classes…</div></div></section>
      <section class="panel" id="classroom-detail" hidden>
        <div class="panel-heading"><div><h2 id="classroom-detail-name">Class</h2><p id="classroom-detail-subtitle"></p></div><button type="button" class="btn secondary" id="classroom-back">Back to classes</button></div>
        <div id="classroom-code-wrap" class="message"></div>
        <div class="classroom-split">
          <section class="panel"><h3 class="classroom-subtitle">Announcements</h3>
            <form id="classroom-announcement-form" hidden><div class="field"><label for="classroom-announcement-title">Title *</label><input id="classroom-announcement-title" required minlength="3" maxlength="120"></div><div class="field"><label for="classroom-announcement-body">Message *</label><textarea id="classroom-announcement-body" required minlength="3" maxlength="4000"></textarea></div><button class="btn" type="submit">Publish announcement</button></form>
            <div id="classroom-announcements"></div>
          </section>
          <section class="panel"><h3 class="classroom-subtitle">Learning materials</h3>
            <form id="classroom-material-form" hidden><div class="field"><label for="classroom-material-title">Material title *</label><input id="classroom-material-title" required minlength="2" maxlength="160"></div><div class="field"><label for="classroom-material-description">Description</label><input id="classroom-material-description" maxlength="1000"></div><div class="field"><label for="classroom-material-url">Resource link *</label><input id="classroom-material-url" type="url" required maxlength="2048" placeholder="https://…"></div><button class="btn" type="submit">Share material link</button></form>
            <div id="classroom-materials"></div>
          </section>
        </div>
        <section class="panel"><div class="panel-heading"><div><h3 class="classroom-subtitle">Class members & assistant</h3><p>Teachers appoint or remove an enrolled student as Class Assistant.</p></div></div><div id="classroom-roster" class="classroom-roster"></div><div id="classroom-assistant-controls" class="actions" hidden><label for="classroom-assistant-select" class="classroom-small">Choose verified student</label><select id="classroom-assistant-select" style="max-width:260px;border:1px solid #d9e4df;border-radius:9px;padding:9px"></select><button type="button" class="btn" id="classroom-appoint-assistant">Appoint assistant</button><button type="button" class="btn secondary" id="classroom-remove-assistant">Remove assistant</button></div></section>
        <section class="panel"><div class="panel-heading"><div><h3 class="classroom-subtitle">Attendance</h3><p>Assistant activity is recorded for teacher review.</p></div></div><form id="classroom-session-form" hidden><div class="grid two"><div class="field"><label for="classroom-session-title">Class session *</label><input id="classroom-session-title" required minlength="2" maxlength="160" placeholder="e.g. Monday lecture"></div><div class="field"><label for="classroom-session-date">Date</label><input id="classroom-session-date" type="date"></div></div><button class="btn" type="submit">Start attendance register</button></form><div class="field" id="classroom-session-picker-wrap" hidden><label for="classroom-session-picker">Attendance session</label><select id="classroom-session-picker"></select></div><div id="classroom-attendance" class="classroom-roster"></div></section>
        <p id="classroom-detail-message" class="message" role="status" aria-live="polite"></p>
      </section>`;
    const footer = content.querySelector(".footer");
    if (footer) content.insertBefore(section, footer);
    else content.appendChild(section);
  }

  function message(text) { const el = $("classroom-detail-message"); if (el) el.textContent = text || ""; }
  function roleIs(role) { return currentProfile?.role === role && currentProfile?.verification_status === "verified"; }
  async function loadTeacherJoinCode(classroomId) {
    const { data, error } = await backend().client.rpc("get_campus_classroom_join_code", {
      p_classroom_id: classroomId
    });
    if (error) throw error;
    return typeof data === "string" ? data : (data?.get_campus_classroom_join_code || null);
  }
  async function refreshClasses() {
    const b = backend();
    const list = $("classroom-list");
    if (!b?.isConfigured || !b.client) { list.innerHTML = '<div class="empty">Supabase is not configured.</div>'; return; }
    list.innerHTML = '<div class="empty">Loading classes…</div>';
    try {
      const {data,error} = await b.client.from("campus_classrooms")
        .select("id,university_id,name,subject,description,teacher_id,assistant_student_id,created_at")
        .order("created_at",{ascending:false});
      if (error) throw error;
      if (!data?.length) { list.innerHTML = '<div class="empty-state"><span class="empty-state-mark">▦</span><div><strong>No classes yet</strong><p>Create a class or join using a code from your teacher.</p></div></div>'; return; }
      const cards = await Promise.all(data.map(async c => {
        const teacherOwner = roleIs("teacher") && c.teacher_id === currentProfile.id;
        let code = null;
        if (teacherOwner) {
          try { code = await loadTeacherJoinCode(c.id); }
          catch (codeError) { console.warn("Could not retrieve this classroom's join code.", codeError); }
        }
        const codeMarkup = teacherOwner && code ? `<p>Join code <span class="classroom-code">${esc(code)}</span></p>` : "";
        const copyMarkup = teacherOwner && code ? `<button type="button" class="btn secondary" data-copy-code="${esc(code)}">Copy code</button>` : "";
        return `<article class="classroom-card"><h3>${esc(c.name)}</h3><p>${esc(c.subject)}</p><p>${esc(c.description || "No description provided.")}</p>${codeMarkup}<div class="actions" style="margin-top:12px"><button type="button" class="btn" data-open-class="${esc(c.id)}">Open classroom</button>${copyMarkup}</div></article>`;
      }));
      list.innerHTML = cards.join("");
    } catch (e) { console.error(e); list.innerHTML = '<div class="empty">Classes could not be loaded. Your account may not have classroom access yet.</div>'; }
  }

  async function openClass(id) {
    const b = backend();
    try {
      const {data:row,error} = await b.client.from("campus_classrooms")
        .select("id,university_id,name,subject,description,teacher_id,assistant_student_id,created_at")
        .eq("id",id).single();
      if (error) throw error;
      const teacher = roleIs("teacher") && row.teacher_id === currentProfile.id;
      if (teacher) {
        try { row.join_code = await loadTeacherJoinCode(id); }
        catch (codeError) { console.warn("Could not retrieve this classroom's join code.", codeError); row.join_code = null; }
      }
      selectedClass = row;
      const assistant = row.assistant_student_id === currentProfile.id;
      $("classroom-detail").hidden = false;
      $("classroom-list").parentElement.hidden = true;
      $("classroom-create-panel").hidden = true;
      $("classroom-join-panel").hidden = true;
      $("classroom-detail-name").textContent = row.name;
      $("classroom-detail-subtitle").textContent = row.subject + (row.description ? " · " + row.description : "");
      $("classroom-code-wrap").innerHTML = teacher ? (row.join_code ? 'Class code <span class="classroom-code">' + esc(row.join_code) + '</span> <button type="button" class="btn secondary" data-copy-code="' + esc(row.join_code) + '">Copy code</button>' : 'Join code is temporarily unavailable. Refresh and try again.') : (assistant ? '<span class="tag low">Class Assistant</span> You can help record attendance.' : 'Class resources and announcements');
      $("classroom-announcement-form").hidden = !teacher;
      $("classroom-material-form").hidden = !teacher;
      $("classroom-assistant-controls").hidden = !teacher;
      $("classroom-session-form").hidden = !(teacher || assistant);
      await Promise.all([loadRoster(),loadAnnouncements(),loadMaterials(),loadSessions()]);
      message("");
    } catch(e) { console.error(e); message(e.message || "Could not open this classroom."); }
  }

  async function loadRoster() {
    const b = backend();
    const {data,error} = await b.client.rpc("list_campus_classroom_roster",{p_classroom_id:selectedClass.id});
    if (error) throw error;
    const roster = data || [];
    $("classroom-roster").innerHTML = roster.map(s => `<div class="classroom-person"><span><strong>${esc(s.display_name)}</strong>${s.is_assistant ? ' <span class="tag low">Class Assistant</span>' : ''}</span><span class="classroom-small">${s.is_assistant ? "Assistant" : "Student"}</span></div>`).join("") || '<div class="empty">No enrolled students yet.</div>';
    const eligible = roster.filter(s => !s.is_assistant);
    $("classroom-assistant-select").innerHTML = '<option value="">Select enrolled student…</option>' + eligible.map(s=>'<option value="'+esc(s.student_id)+'">'+esc(s.display_name)+'</option>').join("");
    $("classroom-remove-assistant").hidden = !selectedClass.assistant_student_id;
  }
  async function loadAnnouncements() {
    const {data,error} = await backend().client.from("campus_classroom_announcements").select("id,title,body,author_id,created_at").eq("classroom_id",selectedClass.id).order("created_at",{ascending:false});
    if (error) throw error;
    $("classroom-announcements").innerHTML = (data||[]).map(a=>'<article class="classroom-entry"><strong>'+esc(a.title)+'</strong><p>'+esc(a.body)+'</p><span class="classroom-small">'+esc(new Date(a.created_at).toLocaleString())+'</span></article>').join("") || '<div class="empty">No announcements yet.</div>';
  }
  async function loadMaterials() {
    const {data,error} = await backend().client.from("campus_classroom_materials").select("id,title,description,resource_url,created_at").eq("classroom_id",selectedClass.id).order("created_at",{ascending:false});
    if (error) throw error;
    $("classroom-materials").innerHTML = (data||[]).map(m=>'<article class="classroom-entry"><strong>'+esc(m.title)+'</strong><p>'+esc(m.description||"")+'</p><a href="'+esc(m.resource_url)+'" target="_blank" rel="noopener noreferrer">Open learning material ↗</a><br><span class="classroom-small">'+esc(new Date(m.created_at).toLocaleDateString())+'</span></article>').join("") || '<div class="empty">No learning materials shared yet.</div>';
  }
  async function loadSessions() {
    const b=backend();
    const {data,error}=await b.client.from("campus_class_sessions").select("id,title,session_date,recorded_by,created_at").eq("classroom_id",selectedClass.id).order("session_date",{ascending:false});
    if(error) throw error;
    const sessions=data||[];
    $("classroom-session-picker-wrap").hidden=!sessions.length;
    $("classroom-session-picker").innerHTML=sessions.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.title)+' · '+esc(s.session_date)+'</option>').join("");
    currentSession=sessions[0]?.id||null;
    await loadAttendance();
  }
  async function loadAttendance() {
    const area=$("classroom-attendance");
    if(!currentSession || !selectedClass) { area.innerHTML='<div class="empty">Create an attendance session to begin.</div>'; return; }
    const b=backend();
    const {data:rows,error}=await b.client.rpc("list_campus_classroom_roster",{p_classroom_id:selectedClass.id});
    if(error) throw error;
    const {data:attendance,error:aError}=await b.client.from("campus_class_attendance").select("student_id,status,marked_by,marked_at").eq("session_id",currentSession);
    if(aError) throw aError;
    const byStudent=new Map((attendance||[]).map(a=>[a.student_id,a]));
    const canMark=roleIs("teacher") && selectedClass.teacher_id===currentProfile.id || selectedClass.assistant_student_id===currentProfile.id;
    area.innerHTML=(rows||[]).map(s=>{
      const saved=byStudent.get(s.student_id);
      return '<div class="classroom-attendance-row"><span><strong>'+esc(s.display_name)+'</strong><br><span class="classroom-small">'+(saved?'Recorded '+esc(new Date(saved.marked_at).toLocaleString()):'Not recorded')+'</span></span><select data-attendance-status="'+esc(s.student_id)+'" '+(!canMark?'disabled':'')+'><option value="">Not marked</option><option value="present" '+(saved?.status==='present'?'selected':'')+'>Present</option><option value="absent" '+(saved?.status==='absent'?'selected':'')+'>Absent</option><option value="late" '+(saved?.status==='late'?'selected':'')+'>Late</option></select><button type="button" class="btn secondary" data-save-attendance="'+esc(s.student_id)+'" '+(!canMark?'hidden':'')+'>Save</button></div>';
    }).join("") || '<div class="empty">No students enrolled.</div>';
  }

  document.addEventListener("click", async event => {
    const navButton=event.target.closest('[data-page="classrooms"]');
    if(navButton){
      window.setTimeout(async()=>{
        if($("sectionTitle")) $("sectionTitle").textContent="My Classrooms";
        try{
          const b=backend(); const user=await b.getCurrentUser();
          if(!user) return;
          const {data,error}=await b.client.from("profiles").select("id,role,verification_status").eq("id",user.id).single();
          if(error) throw error;
          currentProfile=data;
          const verified=data.verification_status==="verified";
          $("classroom-create-panel").hidden=!(verified&&data.role==="teacher");
          $("classroom-join-panel").hidden=!(verified&&data.role==="student");
          $("classroom-role-note").textContent=!verified ? "Your account must be verified before using classrooms." : data.role==="teacher" ? "Teacher view: create classes, share the join code, appoint one Class Assistant, and review attendance." : data.role==="student" ? "Student view: join with a teacher’s code, view resources, and check attendance." : "Classrooms are available to verified teacher and student accounts.";
          await refreshClasses();
        }catch(e){$("classroom-role-note").textContent=e.message||"Could not verify classroom access.";}
      },0);
    }
    const open=event.target.closest("[data-open-class]");
    if(open){await openClass(open.dataset.openClass);}
    const copy=event.target.closest("[data-copy-code]");
    if(copy){try{await navigator.clipboard.writeText(copy.dataset.copyCode);copy.textContent="Copied";}catch{message("Class code: "+copy.dataset.copyCode);}}
    if(event.target.closest("#classroom-back")){
      $("classroom-detail").hidden=true;$("classroom-list").parentElement.hidden=false;
      $("classroom-create-panel").hidden=!(roleIs("teacher"));$("classroom-join-panel").hidden=!(roleIs("student"));
      message("");
    }
    const save=event.target.closest("[data-save-attendance]");
    if(save){
      const studentId=save.dataset.saveAttendance;
      const status=$("classroom-attendance").querySelector('[data-attendance-status="'+studentId+'"]').value;
      if(!status){message("Choose Present, Absent, or Late first.");return;}
      save.disabled=true;
      try{const {error}=await backend().client.rpc("mark_campus_class_attendance",{p_session_id:currentSession,p_student_id:studentId,p_status:status});if(error)throw error;await loadAttendance();message("Attendance saved with an audit record.");}
      catch(e){message(e.message||"Could not save attendance.");}finally{save.disabled=false;}
    }
  });

  $("classroom-create-form")?.addEventListener("submit",async e=>{
    e.preventDefault();const button=$("classroom-create-button");button.disabled=true;
    try{
      const {data,error}=await backend().client.rpc("create_campus_classroom",{p_name:$("classroom-name").value.trim(),p_subject:$("classroom-subject").value.trim(),p_description:$("classroom-description").value.trim()});
      if(error)throw error;
      $("classroom-create-form").reset();await refreshClasses();message("Class created. Share join code "+data.join_code+" with your students.");if(data.id)await openClass(data.id);
    }catch(err){message(err.message||"Could not create class.");}finally{button.disabled=false;}
  });
  $("classroom-join-form")?.addEventListener("submit",async e=>{
    e.preventDefault();const button=$("classroom-join-button");button.disabled=true;
    try{const {data,error}=await backend().client.rpc("join_campus_classroom",{p_join_code:$("classroom-join-code").value.trim().toUpperCase()});if(error)throw error;$("classroom-join-form").reset();await refreshClasses();await openClass(data);message("You joined the class successfully.");}
    catch(err){message(err.message||"Could not join this class.");}finally{button.disabled=false;}
  });
  $("classroom-announcement-form")?.addEventListener("submit",async e=>{
    e.preventDefault();try{const {error}=await backend().client.from("campus_classroom_announcements").insert({classroom_id:selectedClass.id,author_id:currentProfile.id,title:$("classroom-announcement-title").value.trim(),body:$("classroom-announcement-body").value.trim()});if(error)throw error;$("classroom-announcement-form").reset();await loadAnnouncements();message("Announcement published.");}catch(err){message(err.message||"Could not publish announcement.");}
  });
  $("classroom-material-form")?.addEventListener("submit",async e=>{
    e.preventDefault();try{const url=new URL($("classroom-material-url").value);if(!["https:","http:"].includes(url.protocol))throw new Error("Use a valid http or https resource link.");const {error}=await backend().client.from("campus_classroom_materials").insert({classroom_id:selectedClass.id,uploaded_by:currentProfile.id,title:$("classroom-material-title").value.trim(),description:$("classroom-material-description").value.trim(),resource_url:url.href});if(error)throw error;$("classroom-material-form").reset();await loadMaterials();message("Learning material link shared.");}catch(err){message(err.message||"Could not share this material.");}
  });
  $("classroom-appoint-assistant")?.addEventListener("click",async()=>{
    const id=$("classroom-assistant-select").value;if(!id){message("Choose an enrolled student first.");return;}
    try{const {error}=await backend().client.rpc("set_campus_class_assistant",{p_classroom_id:selectedClass.id,p_student_id:id});if(error)throw error;await openClass(selectedClass.id);message("Class Assistant appointed.");}catch(e){message(e.message||"Could not appoint assistant.");}
  });
  $("classroom-remove-assistant")?.addEventListener("click",async()=>{
    try{const {error}=await backend().client.rpc("set_campus_class_assistant",{p_classroom_id:selectedClass.id,p_student_id:null});if(error)throw error;await openClass(selectedClass.id);message("Class Assistant access removed.");}catch(e){message(e.message||"Could not remove assistant.");}
  });
  $("classroom-session-form")?.addEventListener("submit",async e=>{
    e.preventDefault();try{const {data,error}=await backend().client.rpc("create_campus_class_session",{p_classroom_id:selectedClass.id,p_title:$("classroom-session-title").value.trim(),p_session_date:$("classroom-session-date").value||new Date().toISOString().slice(0,10)});if(error)throw error;$("classroom-session-form").reset();await loadSessions();$("classroom-session-picker").value=data;currentSession=data;await loadAttendance();message("Attendance register created.");}catch(err){message(err.message||"Could not create attendance session.");}
  });
  $("classroom-session-picker")?.addEventListener("change",async e=>{currentSession=e.target.value;try{await loadAttendance();}catch(err){message(err.message);}});
  $("classroom-refresh")?.addEventListener("click",refreshClasses);
  // Keep the workspace UI responsive after sign-in; page access is still enforced by RLS/RPCs.
  if (backend()?.client?.auth) backend().client.auth.onAuthStateChange(event=>{
    if(event==="SIGNED_OUT"){currentProfile=null;selectedClass=null;if($("page-classrooms")){$("classroom-list").innerHTML='<div class="empty">Sign in to view classes.</div>';$("classroom-detail").hidden=true;}}
  });
})();