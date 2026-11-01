(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { api:null, client:null, user:null, campus:null, profile:null, events:[], groups:[] };
  const rootId = "campuspulse-social-suite";

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };
  const btn = (text, attrs, cls) => {
    const n = el("button", cls || "btn secondary", text);
    n.type = "button";
    Object.entries(attrs || {}).forEach(([k,v]) => n.setAttribute(k, v));
    return n;
  };
  const status = (id, text, error) => {
    const n = $(id);
    if (!n) return;
    n.textContent = text || "";
    n.dataset.state = error ? "error" : "ok";
  };
  const empty = (feed, text) => feed.replaceChildren(el("p","campuspulse-social-empty",text));
  const card = (title, body) => {
    const n = el("article","campuspulse-social-card");
    n.append(el("h3","",title));
    if (body) n.append(el("p","campuspulse-social-card-copy",body));
    return n;
  };
  const dateText = (v) => {
    const d = new Date(v);
    return v && !Number.isNaN(d.getTime()) ? d.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}) : "Time not set";
  };
  const actions = (n) => { const a=el("div","campuspulse-social-actions"); n.append(a); return a; };

  function mount() {
    const page=$("page-community");
    const anchor=page?.querySelector(".campuspulse-welcome");
    if(!page||!anchor||$(rootId))return;
    const shell=document.createElement("section");
    shell.id=rootId;
    shell.className="panel campuspulse-social-suite";
    shell.innerHTML=[
      "<div class='campuspulse-social-heading'><div><span class='campuspulse-social-kicker'>CAMPUSPULSE · MORE TOGETHER</span><h2>Find your people. Make campus memories.</h2><p>Join activities, meet collaborators, find event buddies and help others settle into campus life.</p></div><span class='campuspulse-social-live'>Campus community</span></div>",
      "<div class='campuspulse-social-tabs' role='tablist' aria-label='CampusPulse activities'>",
      "<button type='button' role='tab' aria-selected='true' data-cps-tab='missions'>Missions</button><button type='button' role='tab' aria-selected='false' data-cps-tab='collab'>Collab Finder</button><button type='button' role='tab' aria-selected='false' data-cps-tab='buddies'>Event Buddies</button><button type='button' role='tab' aria-selected='false' data-cps-tab='clubs'>Club Hubs</button><button type='button' role='tab' aria-selected='false' data-cps-tab='mentorship'>Mentorship</button><button type='button' role='tab' aria-selected='false' data-cps-tab='memories'>Memories</button><button type='button' role='tab' aria-selected='false' data-cps-tab='connections'>Connections</button></div>",
      "<div class='campuspulse-social-panel' data-cps-panel='missions'><div class='campuspulse-social-panel-head'><div><h3>Campus Missions</h3><p>Weekly actions reuse the existing Challenges and Rewards progress system.</p></div><button type='button' class='btn secondary' data-page='student-rewards'>Open rewards</button></div><p id='cps-missions-status' class='message' role='status'>Loading missions…</p><div id='cps-missions-list' class='campuspulse-social-grid'></div></div>",
      "<div class='campuspulse-social-panel' data-cps-panel='collab' hidden><div class='campuspulse-social-panel-head'><div><h3>Collab Finder</h3><p>Find study partners, project teammates, research collaborators and creative partners at your university.</p></div></div><form id='cps-collab-form' class='campuspulse-social-form'><div class='field'><label for='cps-collab-title'>What are you working on? *</label><input id='cps-collab-title' required minlength='3' maxlength='120' placeholder='e.g. Build a student budgeting app'></div><div class='field'><label for='cps-collab-category'>Category</label><select id='cps-collab-category'><option value='study'>Study partner</option><option value='project'>Project</option><option value='hackathon'>Hackathon</option><option value='research'>Research</option><option value='career'>Career / portfolio</option><option value='creative'>Creative collaboration</option><option value='other'>Other</option></select></div><div class='field'><label for='cps-collab-description'>Details *</label><textarea id='cps-collab-description' required minlength='10' maxlength='1200' rows='3'></textarea></div><div class='field'><label for='cps-collab-skills'>Skills or interests (comma separated)</label><input id='cps-collab-skills' maxlength='250' placeholder='e.g. Python, design, writing'></div><div class='field'><label for='cps-collab-availability'>Availability</label><input id='cps-collab-availability' maxlength='120' placeholder='e.g. Weekday evenings'></div><div class='field'><label for='cps-collab-slots'>People needed</label><select id='cps-collab-slots'><option value='1'>1 person</option><option value='2' selected>2 people</option><option value='3'>3 people</option><option value='4'>4 people</option><option value='5'>5 people</option></select></div><button class='btn' type='submit' id='cps-collab-submit'>Post collaboration</button><p id='cps-collab-status' class='message' role='status'></p></form><div class='campuspulse-social-feed-head'><h3>Open collaborations</h3><button type='button' class='btn secondary' data-cps-refresh='collab'>Refresh</button></div><div id='cps-collab-list' class='campuspulse-social-grid'></div></div>",
      "<div class='campuspulse-social-panel' data-cps-panel='buddies' hidden><div class='campuspulse-social-panel-head'><div><h3>Event Buddies</h3><p>Find verified students who would like to attend a published campus event together.</p></div></div><form id='cps-buddy-form' class='campuspulse-social-form'><div class='field'><label for='cps-buddy-event'>Upcoming event *</label><select id='cps-buddy-event' required><option value=''>Loading events…</option></select></div><div class='field'><label for='cps-buddy-note'>Your note *</label><textarea id='cps-buddy-note' required minlength='5' maxlength='500' rows='2'></textarea></div><div class='field'><label for='cps-buddy-count'>Extra buddies</label><select id='cps-buddy-count'><option value='1'>1</option><option value='2'>2</option><option value='3'>3</option><option value='4'>4</option></select></div><button class='btn' type='submit'>Find an event buddy</button><p id='cps-buddy-status' class='message' role='status'></p></form><div class='campuspulse-social-feed-head'><h3>People looking for event buddies</h3><button type='button' class='btn secondary' data-cps-refresh='buddies'>Refresh</button></div><div id='cps-buddy-list' class='campuspulse-social-grid'></div></div>",
      "<div class='campuspulse-social-panel' data-cps-panel='clubs' hidden><div class='campuspulse-social-panel-head'><div><h3>Club Hubs</h3><p>Societies reuse the existing approved Campus Groups system. New clubs use the same campus review.</p></div><button type='button' class='btn secondary' data-page='groups'>Open all groups</button></div><form id='cps-club-form' class='campuspulse-social-form'><div class='field'><label for='cps-club-name'>Club or society name *</label><input id='cps-club-name' required minlength='3' maxlength='100'></div><div class='field'><label for='cps-club-description'>What is this club about? *</label><textarea id='cps-club-description' required minlength='10' maxlength='1000' rows='2'></textarea></div><button class='btn' type='submit'>Submit a club hub</button><p id='cps-club-status' class='message' role='status'></p></form><div class='campuspulse-social-feed-head'><h3>Campus societies</h3><button type='button' class='btn secondary' data-cps-refresh='clubs'>Refresh</button></div><div id='cps-club-list' class='campuspulse-social-grid'></div></div>",
      "<div class='campuspulse-social-panel' data-cps-panel='mentorship' hidden><div class='campuspulse-social-panel-head'><div><h3>Peer Mentorship</h3><p>Volunteer to guide students with study routines, campus life or career preparation. This is peer support, not professional counselling or official university advice.</p></div></div><form id='cps-mentor-form' class='campuspulse-social-form'><div class='field'><label for='cps-mentor-headline'>What can you help with? *</label><input id='cps-mentor-headline' required minlength='5' maxlength='120'></div><div class='field'><label for='cps-mentor-bio'>A little about your experience *</label><textarea id='cps-mentor-bio' required minlength='20' maxlength='1000' rows='3'></textarea></div><div class='field'><label for='cps-mentor-topics'>Topics (comma separated)</label><input id='cps-mentor-topics' maxlength='250'></div><div class='field'><label for='cps-mentor-availability'>Availability</label><input id='cps-mentor-availability' maxlength='120'></div><button class='btn' type='submit'>Save volunteer profile</button><button class='btn secondary' type='button' id='cps-mentor-pause'>Pause my profile</button><p id='cps-mentor-status' class='message' role='status'></p></form><div class='campuspulse-social-feed-head'><h3>Volunteer mentors</h3><button type='button' class='btn secondary' data-cps-refresh='mentorship'>Refresh</button></div><div id='cps-mentor-list' class='campuspulse-social-grid'></div></div>",
      "<div class='campuspulse-social-panel' data-cps-panel='memories' hidden><div class='campuspulse-social-panel-head'><div><h3>Campus Memories</h3><p>Save a favourite campus moment. Text-only for now; photos and video remain disabled until the media scanner is configured.</p></div></div><form id='cps-memory-form' class='campuspulse-social-form'><div class='field'><label for='cps-memory-title'>Memory title *</label><input id='cps-memory-title' required minlength='3' maxlength='120'></div><div class='field'><label for='cps-memory-event'>Link to an event (optional)</label><select id='cps-memory-event'><option value=''>No event link</option></select></div><div class='field'><label for='cps-memory-text'>Your memory *</label><textarea id='cps-memory-text' required minlength='20' maxlength='1200' rows='3'></textarea></div><button class='btn' type='submit'>Submit memory for review</button><p id='cps-memory-status' class='message' role='status'></p></form><div class='campuspulse-social-feed-head'><h3>Campus memories</h3><button type='button' class='btn secondary' data-cps-refresh='memories'>Refresh</button></div><div id='cps-memory-list' class='campuspulse-social-grid'></div></div>",
      "<div class='campuspulse-social-panel' data-cps-panel='connections' hidden><div class='campuspulse-social-panel-head'><div><h3>Connection requests</h3><p>Accept or decline requests before starting a private conversation. Email and private identity details are never shown.</p></div><button type='button' class='btn secondary' data-cps-refresh='connections'>Refresh</button></div><div id='cps-connections-list' class='campuspulse-social-grid'></div><div id='cps-social-reports-panel' hidden><div class='campuspulse-social-feed-head'><h3>CampusPulse reports</h3><button type='button' class='btn secondary' data-cps-refresh='reports'>Refresh</button></div><div id='cps-social-reports-list' class='campuspulse-social-grid'></div></div></div>",
      "<p id='cps-global-status' class='message' role='status' aria-live='polite'>Loading campus features…</p><p class='campuspulse-social-safety'>Campus-only features for verified members. Do not publish phone numbers, email addresses, room numbers, private student details or exact live locations. For immediate danger, contact campus security or local emergency services directly.</p>"
    ].join("");
    anchor.insertAdjacentElement("afterend",shell);
    wire();
    loadAll();
  }

  async function prepare() {
    const api=window.CampusShieldBackend;
    if(!api?.isConfigured||!api.client)throw new Error("CampusShield could not connect to Supabase.");
    state.api=api;state.client=api.client;state.user=await api.getCurrentUser();
    if(!state.user)throw new Error("Sign in to use CampusPulse social features.");
    state.campus=await api.getMyCampusContext();
    if(!state.campus?.university_id)throw new Error("Choose your university in CampusPulse first.");
    const {data,error}=await state.client.from("profiles").select("role,verification_status").eq("id",state.user.id).maybeSingle();
    if(error)throw error;state.profile=data||{};
    const community=await api.getMyCommunityProfile();
    if(!community?.username)throw new Error("Create your CampusPulse username before using these features.");
  }

  function setTab(name) {
    document.querySelectorAll("[data-cps-tab]").forEach((t)=>t.setAttribute("aria-selected",String(t.dataset.cpsTab===name)));
    document.querySelectorAll("[data-cps-panel]").forEach((p)=>{p.hidden=p.dataset.cpsPanel!==name;});
    if(name==="missions")loadMissions();
    if(name==="collab")loadCollabs();
    if(name==="buddies"){loadEvents();loadBuddies();}
    if(name==="clubs")loadClubs();
    if(name==="mentorship")loadMentors();
    if(name==="memories"){loadEvents();loadMemories();}
    if(name==="connections"){loadConnections();loadReports();}
  }

  async function loadAll() {
    try {
      await prepare();
      status("cps-global-status","Connected to "+(state.campus.university_name||"your university")+".");
      await loadEvents();
      const results=await Promise.allSettled([loadMissions(),loadCollabs(),loadBuddies(),loadClubs(),loadMentors(),loadMemories(),loadConnections()]);
      const staff=["admin","security","teacher"].includes(state.profile.role)&&state.campus.verification_status==="verified";
      $("cps-social-reports-panel").hidden=!staff;
      if(staff)await loadReports();
    } catch(error){status("cps-global-status",error?.message||"CampusPulse social tools are unavailable.",true);}
  }

  async function loadMissions() {
    const feed=$("cps-missions-list");if(!feed||!state.api)return;
    try {
      const data=await state.api.getMyStudentRewards(),rows=Array.isArray(data?.challenges)?data.challenges:[];
      feed.replaceChildren();
      if(!rows.length){empty(feed,"Missions are available to student accounts through Challenges and Rewards. No active missions are available to this account.");}
      rows.forEach((row)=>{
        const c=card(row.title,row.description),target=Math.max(1,Number(row.target_count)||1),count=row.completed?target:Math.max(0,Math.min(target,Number(row.progress_count)||0));
        const p=el("progress","campuspulse-social-progress");p.max=target;p.value=count;c.append(p,el("p","campuspulse-social-muted",row.completed?"Completed · "+row.points+" points earned":count+" of "+target+" · "+row.points+" points"));feed.append(c);
      });
      status("cps-missions-status","Progress comes from your saved CampusShield activity.");
    } catch(error){empty(feed,"Sign in with an eligible student account to view private weekly mission progress.");status("cps-missions-status",error?.message||"Mission progress unavailable.",true);}
  }

  async function loadEvents() {
    if(!state.api)return;
    try {
      state.events=(await state.api.listCampusEvents()).filter((e)=>new Date(e.starts_at).getTime()>Date.now());
      ["cps-buddy-event","cps-memory-event"].forEach((id)=>{
        const s=$(id);if(!s)return;const old=s.value;
        s.replaceChildren(new Option(id==="cps-memory-event"?"No event link":"Choose an event",""));
        state.events.forEach((e)=>s.add(new Option(e.title+" · "+dateText(e.starts_at),e.id)));
        if(old&&Array.from(s.options).some((o)=>o.value===old))s.value=old;
      });
    } catch(error){status("cps-buddy-status",error?.message||"Could not load published events.",true);}
  }

  function withActions(item,type,id) {
    const row=el("div","campuspulse-social-actions");
    row.append(btn("Request to connect",{"data-cps-connect":"1","data-source-type":type,"data-source-id":id},"btn"));
    row.append(btn("Report",{"data-cps-report":"1","data-target-type":type,"data-target-id":id},"btn secondary"));
    item.append(row);
  }

  async function loadCollabs() {
    const feed=$("cps-collab-list");if(!feed||!state.client||!state.campus?.university_id)return;
    const {data,error}=await state.client.from("campus_collab_listings").select("id,user_id,creator_username,title,category,description,skills,availability,slots_available")
      .eq("university_id",state.campus.university_id).eq("status","open").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(50);
    if(error){status("cps-collab-status",error.message,true);return;}
    feed.replaceChildren();if(!data?.length){empty(feed,"No open collaborations yet. Start one and find teammates from your university.");return;}
    data.forEach((r)=>{
      const c=card(r.title,r.description);c.append(el("p","campuspulse-social-meta","@"+r.creator_username+" · "+r.category.replaceAll("_"," ")+" · "+r.slots_available+" place(s)"));
      if(r.skills?.length)c.append(el("p","campuspulse-social-muted","Skills: "+r.skills.join(", ")));
      if(r.availability)c.append(el("p","campuspulse-social-muted","Availability: "+r.availability));
      if(r.user_id===state.user.id)c.append(btn("Close listing",{"data-cps-close-collab":r.id},"btn secondary"));else withActions(c,"collab",r.id);
      feed.append(c);
    });
  }

  async function loadBuddies() {
    const feed=$("cps-buddy-list");if(!feed||!state.client||!state.campus?.university_id)return;
    const {data,error}=await state.client.from("campus_event_buddy_listings").select("id,event_id,user_id,creator_username,note,extra_buddies")
      .eq("university_id",state.campus.university_id).eq("status","open").order("created_at",{ascending:false}).limit(50);
    if(error){status("cps-buddy-status",error.message,true);return;}
    const events=new Map(state.events.map((e)=>[e.id,e]));feed.replaceChildren();
    const rows=(data||[]).filter((r)=>events.has(r.event_id));
    if(!rows.length){empty(feed,"No event-buddy requests yet. Start one for an upcoming published event.");return;}
    rows.forEach((r)=>{
      const e=events.get(r.event_id),c=card(e.title,r.note);c.append(el("p","campuspulse-social-meta","@"+r.creator_username+" · "+dateText(e.starts_at)+" · "+(e.location||"Campus event")));
      c.append(el("p","campuspulse-social-muted",r.extra_buddies+" extra place(s) available"));
      if(r.user_id===state.user.id)c.append(btn("Close request",{"data-cps-close-buddy":r.id},"btn secondary"));else withActions(c,"event_buddy",r.id);
      feed.append(c);
    });
  }

  async function loadClubs() {
    const feed=$("cps-club-list");if(!feed||!state.api)return;
    const [groups,joined]=await Promise.all([state.api.listCampusGroups(),state.api.listMyCampusGroupMemberships()]);
    state.groups=groups.filter((g)=>g.group_type==="society");const members=new Set(joined);feed.replaceChildren();
    if(!state.groups.length){empty(feed,"No approved society hubs yet. Submit a club above; it will go through campus review.");return;}
    state.groups.forEach((g)=>{
      const c=card(g.name,g.description||"Campus society");c.append(el("p","campuspulse-social-meta","@"+(g.creator_username||"campus member")));
      c.append(btn(members.has(g.id)?"Leave club":"Join club",{"data-cps-club-action":members.has(g.id)?"leave":"join","data-club-id":g.id},members.has(g.id)?"btn secondary":"btn"));feed.append(c);
    });
  }

  async function loadMentors() {
    const feed=$("cps-mentor-list");if(!feed||!state.client||!state.campus?.university_id)return;
    const {data,error}=await state.client.from("campus_mentorship_profiles").select("id,user_id,creator_username,mentor_type,headline,bio,topics,availability")
      .eq("university_id",state.campus.university_id).eq("is_active",true).order("created_at",{ascending:false}).limit(50);
    if(error){status("cps-mentor-status",error.message,true);return;}
    feed.replaceChildren();if(!data?.length){empty(feed,"No volunteer mentors yet. You can be the first to offer peer guidance.");return;}
    data.forEach((r)=>{
      const c=card(r.headline,r.bio);c.append(el("p","campuspulse-social-meta","@"+r.creator_username+" · "+(r.mentor_type==="staff"?"Verified campus staff":"Peer volunteer")));
      if(r.topics?.length)c.append(el("p","campuspulse-social-muted","Topics: "+r.topics.join(", ")));
      if(r.availability)c.append(el("p","campuspulse-social-muted","Availability: "+r.availability));
      if(r.user_id===state.user.id)c.append(btn("Pause profile",{"data-cps-pause-mentor":r.id},"btn secondary"));else withActions(c,"mentorship",r.id);
      feed.append(c);
    });
  }

  async function loadMemories() {
    const feed=$("cps-memory-list");if(!feed||!state.client||!state.campus?.university_id)return;
    const {data,error}=await state.client.from("campus_memories").select("id,user_id,creator_username,event_id,title,memory_text,status,created_at")
      .eq("university_id",state.campus.university_id).order("created_at",{ascending:false}).limit(50);
    if(error){status("cps-memory-status",error.message,true);return;}
    const staff=["admin","security","teacher"].includes(state.profile?.role)&&state.campus.verification_status==="verified";
    feed.replaceChildren();if(!data?.length){empty(feed,"No published memories yet. Share a moment; memories appear after campus review.");return;}
    data.forEach((r)=>{
      const c=card(r.title,r.memory_text);c.append(el("p","campuspulse-social-meta","@"+r.creator_username+" · "+(r.status==="published"?"Published":"Awaiting review")));
      if(r.status==="pending"&&r.user_id!==state.user.id&&staff)c.append(btn("Publish memory",{"data-cps-publish-memory":r.id},"btn"));
      if(r.status==="published"&&r.user_id!==state.user.id)withActions(c,"memory",r.id);
      feed.append(c);
    });
  }

  async function loadConnections() {
    const feed=$("cps-connections-list");if(!feed||!state.client||!state.user)return;
    const {data,error}=await state.client.from("campus_peer_connection_requests").select("id,source_type,requester_id,requester_username,recipient_id,recipient_username,note,status,created_at")
      .eq("university_id",state.campus.university_id).or("requester_id.eq."+state.user.id+",recipient_id.eq."+state.user.id).order("created_at",{ascending:false}).limit(50);
    if(error){status("cps-global-status",error.message,true);return;}
    feed.replaceChildren();if(!data?.length){empty(feed,"No requests yet. Connect from a collaboration, event-buddy post or mentor profile.");return;}
    data.forEach((r)=>{
      const incoming=r.recipient_id===state.user.id,other=incoming?r.requester_username:r.recipient_username;
      const c=card((incoming?"Request from @":"Request to @")+other,r.note);c.append(el("p","campuspulse-social-meta",r.source_type.replaceAll("_"," ")+" · "+r.status+" · "+dateText(r.created_at)));
      if(incoming&&r.status==="pending"){c.append(btn("Accept",{"data-cps-connection-action":"accepted","data-connection-id":r.id},"btn"),btn("Decline",{"data-cps-connection-action":"declined","data-connection-id":r.id},"btn secondary"));}
      else if(!incoming&&r.status==="pending")c.append(btn("Withdraw",{"data-cps-connection-action":"withdrawn","data-connection-id":r.id},"btn secondary"));
      else if(r.status==="accepted")c.append(btn("Start private message",{"data-cps-message-user":other},"btn"));
      feed.append(c);
    });
  }

  async function loadReports() {
    const panel=$("cps-social-reports-panel"),feed=$("cps-social-reports-list");
    if(!panel||!feed||!["admin","security","teacher"].includes(state.profile?.role))return;
    panel.hidden=false;
    const {data,error}=await state.client.from("campus_social_feature_reports").select("id,target_type,reason,details,status,created_at")
      .eq("university_id",state.campus.university_id).in("status",["pending","reviewing"]).order("created_at",{ascending:false}).limit(50);
    if(error){empty(feed,"Could not load reports.");return;}
    feed.replaceChildren();if(!data?.length){empty(feed,"No open CampusPulse reports.");return;}
    data.forEach((r)=>{
      const c=card(r.target_type+" report · "+r.reason,r.details||"No extra details provided.");
      c.append(btn("Mark reviewing",{"data-cps-report-status":"reviewing","data-report-id":r.id},"btn secondary"),btn("Resolve",{"data-cps-report-status":"resolved","data-report-id":r.id},"btn"),btn("Dismiss",{"data-cps-report-status":"dismissed","data-report-id":r.id},"btn secondary"));feed.append(c);
    });
  }

  async function submitCollab(event) {
    event.preventDefault();const b=$("cps-collab-submit");b.disabled=true;
    try {
      const skills=$("cps-collab-skills").value.split(",").map((v)=>v.trim()).filter(Boolean).slice(0,8);
      const {error}=await state.client.from("campus_collab_listings").insert({title:$("cps-collab-title").value.trim(),category:$("cps-collab-category").value,
        description:$("cps-collab-description").value.trim(),skills,availability:$("cps-collab-availability").value.trim()||null,slots_available:Number($("cps-collab-slots").value)||1});
      if(error)throw error;$("cps-collab-form").reset();status("cps-collab-status","Collaboration posted to verified members of your university.");await loadCollabs();
    }catch(error){status("cps-collab-status",error.message||"Could not post collaboration.",true);}finally{b.disabled=false;}
  }
  async function submitBuddy(event) {
    event.preventDefault();const b=$("cps-buddy-form").querySelector("button[type='submit']");b.disabled=true;
    try {
      const {error}=await state.client.from("campus_event_buddy_listings").insert({event_id:$("cps-buddy-event").value,note:$("cps-buddy-note").value.trim(),extra_buddies:Number($("cps-buddy-count").value)||1});
      if(error)throw error;$("cps-buddy-form").reset();status("cps-buddy-status","Your event-buddy invitation is now visible on your campus.");await loadEvents();await loadBuddies();
    }catch(error){status("cps-buddy-status",error.message||"Could not create event-buddy request.",true);}finally{b.disabled=false;}
  }
  async function submitClub(event) {
    event.preventDefault();const b=$("cps-club-form").querySelector("button[type='submit']");b.disabled=true;
    try {
      await state.api.createCampusGroup({name:$("cps-club-name").value.trim(),description:$("cps-club-description").value.trim(),groupType:"society",privacy:"campus"});
      $("cps-club-form").reset();status("cps-club-status","Club submitted through the existing campus-group approval workflow.");await loadClubs();
    }catch(error){status("cps-club-status",error.message||"Could not submit club.",true);}finally{b.disabled=false;}
  }
  async function saveMentor(active) {
    const b=$("cps-mentor-form").querySelector("button[type='submit']");b.disabled=true;
    try {
      const current=await state.client.from("campus_mentorship_profiles").select("id").eq("user_id",state.user.id).maybeSingle();if(current.error)throw current.error;
      const payload={headline:$("cps-mentor-headline").value.trim(),bio:$("cps-mentor-bio").value.trim(),
        topics:$("cps-mentor-topics").value.split(",").map((v)=>v.trim()).filter(Boolean).slice(0,10),
        availability:$("cps-mentor-availability").value.trim()||null,is_active:active};
      const result=current.data?.id?await state.client.from("campus_mentorship_profiles").update(payload).eq("id",current.data.id):await state.client.from("campus_mentorship_profiles").insert(payload);
      if(result.error)throw result.error;status("cps-mentor-status",active?"Volunteer profile is active.":"Volunteer profile is paused.");await loadMentors();
    }catch(error){status("cps-mentor-status",error.message||"Could not save mentor profile.",true);}finally{b.disabled=false;}
  }
  async function submitMemory(event) {
    event.preventDefault();const b=$("cps-memory-form").querySelector("button[type='submit']");b.disabled=true;
    try {
      const {error}=await state.client.from("campus_memories").insert({title:$("cps-memory-title").value.trim(),event_id:$("cps-memory-event").value||null,memory_text:$("cps-memory-text").value.trim()});
      if(error)throw error;$("cps-memory-form").reset();status("cps-memory-status","Memory submitted for campus review.");await loadMemories();
    }catch(error){status("cps-memory-status",error.message||"Could not submit memory.",true);}finally{b.disabled=false;}
  }
  async function sendConnect(type,id) {
    const note=window.prompt("Add a short note (5–500 characters):","Hello, I would like to connect about this CampusPulse opportunity.");
    if(note===null)return;if(note.trim().length<5||note.trim().length>500)throw new Error("Your note must be between 5 and 500 characters.");
    const {error}=await state.client.from("campus_peer_connection_requests").insert({source_type:type,source_id:id,note:note.trim()});if(error)throw error;
    status("cps-global-status","Connection request sent.");await loadConnections();
  }
  async function reportItem(type,id) {
    const details=window.prompt("Add details for your campus moderation team (optional):","");
    if(details===null)return;
    const {error}=await state.client.from("campus_social_feature_reports").insert({target_type:type,target_id:id,reason:"other",details:details.trim()||null});if(error)throw error;
    status("cps-global-status","Report sent to your campus moderation team.");
  }

  function wire() {
    document.querySelectorAll("[data-cps-tab]").forEach((t)=>t.addEventListener("click",()=>setTab(t.dataset.cpsTab)));
    $("cps-collab-form").addEventListener("submit",submitCollab);
    $("cps-buddy-form").addEventListener("submit",submitBuddy);
    $("cps-club-form").addEventListener("submit",submitClub);
    $("cps-mentor-form").addEventListener("submit",(e)=>{e.preventDefault();saveMentor(true);});
    $("cps-mentor-pause").addEventListener("click",()=>saveMentor(false));
    $("cps-memory-form").addEventListener("submit",submitMemory);
    document.addEventListener("click",async(event)=>{
      const refresh=event.target.closest("[data-cps-refresh]");
      const b=event.target.closest("[data-cps-connect],[data-cps-report],[data-cps-close-collab],[data-cps-close-buddy],[data-cps-club-action],[data-cps-connection-action],[data-cps-message-user],[data-cps-publish-memory],[data-cps-pause-mentor],[data-cps-report-status]");
      try {
        if(refresh){const k=refresh.dataset.cpsRefresh;if(k==="collab")await loadCollabs();if(k==="buddies"){await loadEvents();await loadBuddies();}if(k==="clubs")await loadClubs();if(k==="mentorship")await loadMentors();if(k==="memories")await loadMemories();if(k==="connections")await loadConnections();if(k==="reports")await loadReports();return;}
        if(!b)return;b.disabled=true;
        if(b.hasAttribute("data-cps-connect"))await sendConnect(b.dataset.sourceType,b.dataset.sourceId);
        else if(b.hasAttribute("data-cps-report"))await reportItem(b.dataset.targetType,b.dataset.targetId);
        else if(b.hasAttribute("data-cps-close-collab")){const r=await state.client.from("campus_collab_listings").update({status:"closed"}).eq("id",b.dataset.cpsCloseCollab);if(r.error)throw r.error;await loadCollabs();}
        else if(b.hasAttribute("data-cps-close-buddy")){const r=await state.client.from("campus_event_buddy_listings").update({status:"closed"}).eq("id",b.dataset.cpsCloseBuddy);if(r.error)throw r.error;await loadBuddies();}
        else if(b.hasAttribute("data-cps-club-action")){if(b.dataset.cpsClubAction==="join")await state.api.joinCampusGroup(b.dataset.clubId);else await state.api.leaveCampusGroup(b.dataset.clubId);await loadClubs();}
        else if(b.hasAttribute("data-cps-connection-action")){const r=await state.client.from("campus_peer_connection_requests").update({status:b.dataset.cpsConnectionAction}).eq("id",b.dataset.connectionId);if(r.error)throw r.error;await loadConnections();}
        else if(b.hasAttribute("data-cps-message-user")){await state.api.createCampusDirectMessageRequest(b.dataset.cpsMessageUser,"Hello, I am following up on our CampusPulse connection.");status("cps-global-status","Private message request started. Open Private Messages to continue.");}
        else if(b.hasAttribute("data-cps-publish-memory")){const r=await state.client.from("campus_memories").update({status:"published"}).eq("id",b.dataset.cpsPublishMemory);if(r.error)throw r.error;await loadMemories();}
        else if(b.hasAttribute("data-cps-pause-mentor")){const r=await state.client.from("campus_mentorship_profiles").update({is_active:false}).eq("id",b.dataset.cpsPauseMentor);if(r.error)throw r.error;await loadMentors();}
        else if(b.hasAttribute("data-cps-report-status")){const r=await state.client.from("campus_social_feature_reports").update({status:b.dataset.cpsReportStatus}).eq("id",b.dataset.reportId);if(r.error)throw r.error;await loadReports();}
      }catch(error){status("cps-global-status",error?.message||"CampusPulse action failed.",true);}finally{if(b)b.disabled=false;}
    });
    document.addEventListener("click",(event)=>{const nav=event.target.closest("[data-page='community']");if(nav)window.setTimeout(loadAll,80);});
    window.addEventListener("campusshield:session-changed",()=>window.setTimeout(loadAll,100));
  }
  function init(){mount();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();