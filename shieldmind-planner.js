/* ShieldMind private timetable and in-app reminders. Planner records sync to the user's own RLS-protected rows. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const kinds = new Set(["revision","class","assignment","exam","reminder"]);
  let loading = false, items = [];
  const notified = new Set();
  function status(s){const n=$("shieldmind-planner-status");if(n)n.textContent=s;}
  function text(parent,tag,value,cls){const el=document.createElement(tag);el.textContent=String(value??"");if(cls)el.className=cls;parent.appendChild(el);return el;}
  function dateText(v){if(!v)return "Time not set";const d=new Date(v);return Number.isNaN(d.getTime())?"Time not set":d.toLocaleString();}
  async function userContext(){
    const b=window.CampusShieldBackend;
    if(!b?.isConfigured||!b.client)throw new Error("Supabase is not configured.");
    const {data:{user},error}=await b.client.auth.getUser();
    if(error||!user)throw new Error("Sign in to sync your timetable.");
    const {data:p,error:pe}=await b.client.from("profiles").select("role,requested_role,verification_status").eq("id",user.id).maybeSingle();
    if(pe||!p||p.verification_status!=="verified")throw new Error("A verified campus account is required.");
    const {data:cs,error:ce}=await b.client.rpc("get_my_campus_context");
    const c=Array.isArray(cs)?cs[0]:null;
    if(ce||!c||c.membership_status!=="active"||c.verification_status!=="verified")throw new Error("An active, verified campus membership is required.");
    if((p.requested_role||p.role)==="student"){
      const {data:id,error:ie}=await b.client.from("student_identity_verifications").select("status").eq("user_id",user.id).maybeSingle();
      if(ie||id?.status!=="approved")throw new Error("Approved student identity is required.");
    }
    return {b,user};
  }
  function checkDue(){
    const now=Date.now();
    for(const item of items){
      if(!item.remind_at||item.completed||notified.has(item.id))continue;
      const at=new Date(item.remind_at).getTime(); if(!Number.isFinite(at)||at>now)continue;
      notified.add(item.id); status("Reminder due: "+item.title);
      if("Notification" in window&&Notification.permission==="granted"){
        try{new Notification("CampusShield · ShieldMind reminder",{body:item.title});}catch(_e){}
      }
    }
  }
  function render(){
    const feed=$("shieldmind-planner-feed");if(!feed)return;feed.replaceChildren();
    if(!items.length){text(feed,"div","Your timetable is empty. Add a class, deadline, revision session or reminder above.","community-empty");return;}
    for(const item of items){
      const card=document.createElement("article");card.className="shieldmind-planner-item";
      const body=document.createElement("div");text(body,"h3",item.title);
      text(body,"p",item.kind.charAt(0).toUpperCase()+item.kind.slice(1),"shieldmind-planner-meta");
      if(item.starts_at)text(body,"p","Starts: "+dateText(item.starts_at));
      if(item.remind_at)text(body,"p",(new Date(item.remind_at).getTime()<=Date.now()&&!item.completed?"Reminder due: ":"Remind at: ")+dateText(item.remind_at),"shieldmind-planner-meta");
      if(item.details)text(body,"p",item.details);
      text(body,"p",item.completed?"Completed":"Not completed","shieldmind-planner-meta");
      const actions=document.createElement("div");actions.className="shieldmind-planner-actions";
      const done=document.createElement("button");done.type="button";done.className="btn secondary";done.textContent=item.completed?"Mark incomplete":"Mark complete";
      done.addEventListener("click",()=>change(item.id,{completed:!item.completed}));
      const del=document.createElement("button");del.type="button";del.className="btn secondary";del.textContent="Delete";
      del.addEventListener("click",()=>remove(item.id));actions.append(done,del);card.append(body,actions);feed.appendChild(card);
    }
    checkDue();
  }
  async function load(){
    if(loading)return;loading=true;
    try{
      const {b,user}=await userContext();
      const {data,error}=await b.client.from("shieldmind_planner_items").select("id,user_id,title,kind,details,starts_at,remind_at,completed,created_at").eq("user_id",user.id).order("starts_at",{ascending:true,nullsFirst:false}).limit(100);
      if(error)throw error;items=data||[];status("Timetable synced. Only your account can read these entries.");render();
    }catch(e){items=[];render();status(e?.message||"Your timetable could not be loaded.");}
    finally{loading=false;}
  }
  async function change(id,patch){
    try{const {b,user}=await userContext();const {error}=await b.client.from("shieldmind_planner_items").update({...patch,updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",user.id);if(error)throw error;await load();}
    catch(e){status(e?.message||"Could not update this item.");}
  }
  async function remove(id){
    try{const {b,user}=await userContext();const {error}=await b.client.from("shieldmind_planner_items").delete().eq("id",id).eq("user_id",user.id);if(error)throw error;items=items.filter(x=>x.id!==id);notified.delete(id);render();status("Timetable item deleted.");}
    catch(e){status(e?.message||"Could not delete this item.");}
  }
  async function save(event){
    event.preventDefault();
    const title=String($("shieldmind-plan-title")?.value||"").trim(),kind=String($("shieldmind-plan-kind")?.value||"revision"),details=String($("shieldmind-plan-details")?.value||"").trim();
    const start=$("shieldmind-plan-start")?.value||"",remind=$("shieldmind-plan-remind")?.value||"";
    if(title.length<2||title.length>120||details.length>1000||!kinds.has(kind)){status("Check the title, type and note length.");return;}
    const iso=v=>{if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();};
    const starts_at=iso(start),remind_at=iso(remind);
    if((start&&!starts_at)||(remind&&!remind_at)){status("Enter valid date and time values.");return;}
    const button=$("shieldmind-plan-save");if(button){button.disabled=true;button.textContent="Saving privately…";}
    try{
      const {b,user}=await userContext();
      const {error}=await b.client.from("shieldmind_planner_items").insert({user_id:user.id,title,kind,details,starts_at,remind_at});
      if(error)throw error;$("shieldmind-planner-form").reset();notified.clear();await load();status("Saved and synced to your private account.");
    }catch(e){status(e?.message||"Could not save this timetable item.");}
    finally{if(button){button.disabled=false;button.textContent="Save to my timetable";}}
  }
  async function requestNotifications(){
    if(!("Notification" in window)){status("This browser does not support notifications; reminders remain visible in the app.");return;}
    try{const p=await Notification.requestPermission();status(p==="granted"?"Browser reminders enabled while the app is open.":"Notifications were not enabled; reminders remain visible in the app.");}
    catch(_e){status("Could not request notification permission.");}
  }
  function init(){
    $("shieldmind-planner-form")?.addEventListener("submit",save);
    $("shieldmind-planner-refresh")?.addEventListener("click",load);
    $("shieldmind-plan-notifications")?.addEventListener("click",requestNotifications);
    document.addEventListener("click",e=>{if(e.target.closest('[data-page="shieldmind"]'))load();});
    const b=window.CampusShieldBackend;b?.client?.auth?.onAuthStateChange?.((_e,session)=>{if(!session){items=[];notified.clear();render();status("Sign in to sync your timetable.");}else load();});
    window.setInterval(checkDue,60000);
  }
  window.CampusShieldPlanner={load};init();
})();
