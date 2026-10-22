import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const json = (body: Record<string, unknown>, status=200) => new Response(JSON.stringify(body), {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({error:"Method not allowed"},405);
  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY"), url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret || !url || !service) return json({error:"Webhook not configured"},503);
    const raw = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-512"},false,["sign"]);
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)));
    const expected = Array.from(digest).map(b=>b.toString(16).padStart(2,"0")).join("");
    if (!constantTimeEqual(signature,expected)) return json({error:"Invalid signature"},401);
    const event = JSON.parse(raw);
    const eventType=String(event?.event||"");
    const payload=event?.data||{};
    const recurringEvents=["charge.success","subscription.create","subscription.enable","subscription.not_renew","subscription.disable","invoice.create","invoice.update","invoice.payment_failed"];
    if (!recurringEvents.includes(eventType)) return json({received:true});
    const recurringCode=String(payload.subscription_code||payload.subscription?.subscription_code||"");
    const reference = String(payload.reference||"");
    if (eventType==="charge.success" && !reference) return json({received:true});
    const admin = createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    if(recurringEvents.includes(eventType) && (recurringCode || eventType.startsWith("subscription.") || eventType.startsWith("invoice."))) {
      // A recurring payment must be tied to an authenticated intent and verified against Paystack's API.
      // Browser redirects and unverified webhook payload fields never grant entitlement.
      const resource=eventType==="charge.success"?String(payload.reference||""):String(payload.invoice_code||recurringCode||payload.id||"");
      if(!resource) return json({received:true});
      const eventKey=eventType+":"+resource;
      const receipts=admin.schema("private").from("paystack_billing_event_receipts");
      const {data:prior,error:priorError}=await receipts.select("status").eq("event_key",eventKey).maybeSingle();
      if(priorError) return json({error:"Could not check event idempotency"},503);
      if(prior?.status==="processed") return json({received:true,deduplicated:true});
      if(prior?.status==="processing") return json({error:"Event is already processing"},503);
      if(prior) {
        const {error}=await receipts.update({status:"processing",last_error:null}).eq("event_key",eventKey).eq("status","failed");
        if(error) return json({error:"Could not retry event"},503);
      } else {
        const {error}=await receipts.insert({event_key:eventKey,event_type:eventType,status:"processing"});
        if(error) return json({error:"Event is already processing; retry later"},503);
      }
      try {
        const supported:Record<string,number>={starter:200000,plus:500000,pro:1000000,ultra:1500000,max:2800000};
        const imageLimits:Record<string,number>={starter:20,plus:60,pro:150,ultra:300,max:600};
        const lower=(v:unknown)=>typeof v==="string"?v.trim().toLowerCase():"";
        const dateIso=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
        let sub:any=null, code=recurringCode;
        if(code) {
          const sr=await fetch("https://api.paystack.co/subscription/"+encodeURIComponent(code),{headers:{"Authorization":`Bearer ${secret}`}});
          const sj=await sr.json().catch(()=>null); sub=sj?.data;
          if(!sr.ok||sj?.status!==true||!sub) throw new Error("Paystack subscription verification failed");
        }
        const customerEmail=lower(payload.customer?.email||payload.email||sub?.customer?.email);
        let planInfo:any=(sub?.plan&&typeof sub.plan==="object")?sub.plan:((payload.plan&&typeof payload.plan==="object")?payload.plan:{});
        if(!planInfo?.name) {
          const planId=(sub?.plan&&typeof sub.plan==="object")?(sub.plan.plan_code||sub.plan.id):sub?.plan;
          if(planId!==undefined&&planId!==null) {
            const pr=await fetch("https://api.paystack.co/plan/"+encodeURIComponent(String(planId)),{headers:{"Authorization":`Bearer ${secret}`}});
            const pj=await pr.json().catch(()=>null);
            if(pr.ok&&pj?.status===true&&pj?.data) planInfo=pj.data;
          }
        }
        const planName=lower(planInfo?.name||payload.plan_name);
        const plan=Object.keys(supported).find(p=>planName.includes(p));
        const amount=Number(planInfo?.amount||payload.amount||0);
        const interval=lower(planInfo?.interval||"");
        if(!code||!customerEmail||!plan||amount!==supported[plan]||(interval&&interval!=="monthly")||(planInfo?.currency&&planInfo.currency!=="NGN")) throw new Error("Subscription does not match an allowed monthly tier");
        const now=new Date().toISOString();
        if(eventType==="subscription.create"||eventType==="subscription.enable") {
          const {data:intent,error}=await admin.schema("private").from("shieldmind_billing_intents").select("id,user_id,email,plan,amount_kobo,currency,status,expires_at").eq("email",customerEmail).eq("plan",plan).eq("status","pending").gt("expires_at",now).order("created_at",{ascending:false}).limit(1).maybeSingle();
          if(error) throw new Error("Could not match subscription intent");
          if(intent && intent.amount_kobo===amount && intent.currency==="NGN") {
            const {error:upsertError}=await admin.from("shieldmind_subscriptions").upsert({user_id:intent.user_id,plan:intent.plan,status:"pending",billing_period:"monthly",provider:"paystack",provider_subscription_code:code,provider_customer_code:String(sub.customer?.customer_code||""),renewal_status:lower(sub.status)||"active",amount_kobo:amount,currency:"NGN",image_upload_limit:imageLimits[intent.plan],updated_at:now},{onConflict:"user_id"});
            if(upsertError) throw new Error("Could not bind subscription to the account");
            await admin.schema("private").from("shieldmind_billing_intents").update({status:"matched",provider_subscription_code:code,updated_at:now}).eq("id",intent.id);
          }
        } else if(eventType==="charge.success") {
          const reference=String(payload.reference||"");
          if(!reference||payload.currency!=="NGN"||Number(payload.amount)!==amount) throw new Error("Recurring charge amount or currency mismatch");
          const vr=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{"Authorization":`Bearer ${secret}`}});
          const vj=await vr.json().catch(()=>null),tx=vj?.data;
          if(!vr.ok||vj?.status!==true||tx?.status!=="success"||tx?.reference!==reference||tx?.currency!=="NGN"||Number(tx?.amount)!==amount||lower(tx?.customer?.email)!==customerEmail ) throw new Error("Recurring transaction verification failed");
          const {data:row,error:rowError}=await admin.from("shieldmind_subscriptions").select("user_id,plan,status,expires_at,amount_kobo,currency,last_payment_reference").eq("provider_subscription_code",code).maybeSingle();
          if(rowError) throw new Error("Could not load subscription record");
          if(row) {
            if(row.plan!==plan||row.amount_kobo!==amount||row.currency!=="NGN") throw new Error("Subscription record mismatch");
            if(row.last_payment_reference!==reference) {
              const expires=dateIso(sub.next_payment_date)||new Date(Date.now()+30*86400000).toISOString();
              const {error}=await admin.from("shieldmind_subscriptions").update({status:"active",provider_reference:reference,renewal_status:lower(sub.status)||"active",expires_at:expires,last_payment_reference:reference,last_payment_at:now,updated_at:now}).eq("user_id",row.user_id).eq("provider_subscription_code",code);
              if(error) throw new Error("Could not renew subscription entitlement");
            }
          } else {
            const {data:intent,error}=await admin.schema("private").from("shieldmind_billing_intents").select("id,user_id,email,plan,amount_kobo,currency,status,expires_at").eq("email",customerEmail).eq("plan",plan).in("status",["pending","matched"]).gt("expires_at",now).order("created_at",{ascending:false}).limit(1).maybeSingle();
            if(error) throw new Error("Could not match initial subscription payment");
            if(!intent||intent.amount_kobo!==amount||intent.currency!=="NGN") throw new Error("No valid authenticated subscription intent");
            const expires=dateIso(sub.next_payment_date)||new Date(Date.now()+30*86400000).toISOString();
            const {error:upsertError}=await admin.from("shieldmind_subscriptions").upsert({user_id:intent.user_id,plan:intent.plan,status:"active",billing_period:"monthly",provider:"paystack",provider_reference:reference,provider_subscription_code:code,provider_customer_code:String(sub.customer?.customer_code||""),renewal_status:lower(sub.status)||"active",amount_kobo:amount,currency:"NGN",started_at:now,expires_at:expires,last_payment_reference:reference,last_payment_at:now,image_upload_limit:imageLimits[intent.plan],updated_at:now},{onConflict:"user_id"});
            if(upsertError) throw new Error("Could not activate verified subscription");
            await admin.schema("private").from("shieldmind_billing_intents").update({status:"matched",provider_subscription_code:code,updated_at:now}).eq("id",intent.id);
          }
        } else {
          const {data:row,error}=await admin.from("shieldmind_subscriptions").select("user_id,plan,status,expires_at,amount_kobo,currency").eq("provider_subscription_code",code).maybeSingle();
          if(error) throw new Error("Could not load subscription record");
          if(row&&row.plan===plan&&row.amount_kobo===amount&&row.currency==="NGN") {
            if(eventType==="invoice.payment_failed") await admin.from("shieldmind_subscriptions").update({renewal_status:"attention",updated_at:now}).eq("user_id",row.user_id).eq("provider_subscription_code",code);
            if(eventType==="subscription.not_renew") await admin.from("shieldmind_subscriptions").update({renewal_status:"non-renewing",updated_at:now}).eq("user_id",row.user_id).eq("provider_subscription_code",code);
            if(eventType==="subscription.disable") await admin.from("shieldmind_subscriptions").update({status:"cancelled",renewal_status:lower(sub.status)||"cancelled",expires_at:now,updated_at:now}).eq("user_id",row.user_id).eq("provider_subscription_code",code);
            if(eventType==="subscription.enable") await admin.from("shieldmind_subscriptions").update({renewal_status:"active",updated_at:now}).eq("user_id",row.user_id).eq("provider_subscription_code",code);
            // invoice.create/invoice.update are recorded but do not extend access. Only a verified charge.success does.
          }
        }
        await receipts.update({status:"processed",processed_at:now,last_error:null}).eq("event_key",eventKey);
        return json({received:true});
      } catch(error) {
        await receipts.update({status:"failed",last_error:String(error).slice(0,400)}).eq("event_key",eventKey);
        return json({error:"Recurring event could not be verified safely; retry later"},503);
      }
    }
    const {data:pending,error:pendingError} = await admin.from("shieldmind_subscriptions").select("user_id,plan,billing_period,amount_kobo,currency,status,image_upload_limit").eq("provider_reference",reference).maybeSingle();
    if (pendingError || !pending || pending.status !== "pending" || !["starter","plus","pro","ultra","max"].includes(pending.plan)) return json({received:true});
    const verification = await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{"Authorization":`Bearer ${secret}`}});
    const verified = await verification.json().catch(()=>null);
    const tx = verified?.data;
    if (!verification.ok || verified?.status !== true || tx?.status !== "success" || tx?.reference !== reference || tx?.currency !== "NGN" || tx?.amount !== pending.amount_kobo || tx?.customer?.email == null || tx?.metadata?.user_id !== pending.user_id || tx?.metadata?.plan !== pending.plan || tx?.metadata?.period !== pending.billing_period) return json({received:true});
    const now = new Date(), expires = new Date(now);
    if (pending.billing_period !== "monthly") return json({received:true});
    expires.setUTCDate(expires.getUTCDate()+30);
    const {error:updateError} = await admin.from("shieldmind_subscriptions").update({status:"active",provider:"paystack",started_at:now.toISOString(),expires_at:expires.toISOString(),updated_at:now.toISOString()}).eq("user_id",pending.user_id).eq("provider_reference",reference).eq("status","pending");
    if (updateError) return json({error:"Could not record entitlement"},500);
    return json({received:true});
  } catch (_e) { return json({error:"Invalid webhook payload"},400); }
});
function constantTimeEqual(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
