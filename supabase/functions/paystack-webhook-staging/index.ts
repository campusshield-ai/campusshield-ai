import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function validSignature(raw:string,signature:string,key:string){
 const imported=await crypto.subtle.importKey("raw",new TextEncoder().encode(key),{name:"HMAC",hash:"SHA-512"},false,["sign"]);
 const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",imported,new TextEncoder().encode(raw)));
 return safeEqual([...bytes].map(x=>x.toString(16).padStart(2,"0")).join(""),signature);
}
const prices:Record<string,number>={starter:200000,plus:500000,pro:1000000,ultra:2000000,max:2800000};
const limits:Record<string,number>={starter:20,plus:60,pro:150,ultra:300,max:600};
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const secret=Deno.env.get("PAYSTACK_SECRET_KEY"),url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!secret||!url||!service)return json({error:"Webhook not configured"},503);
  const raw=await req.text(),sig=req.headers.get("x-paystack-signature")||"";
  if(!sig||!await validSignature(raw,sig,secret))return json({error:"Invalid signature"},401);
  let event:any;try{event=JSON.parse(raw);}catch{return json({error:"Invalid JSON"},400);}
  const type=String(event?.event||""),p=event?.data||{},reference=String(p.reference||"");
  // This handler supports the staging 30-day prepaid flow; recurring billing needs Paystack plan codes.
  if(!["charge.success","charge.failed"].includes(type)||!reference.startsWith("sm_"))return json({received:true,ignored:true});
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const receipts=db.schema("private").from("paystack_billing_event_receipts");
  const eventKey=type+":"+reference;
  const {data:prior,error:priorError}=await receipts.select("status").eq("event_key",eventKey).maybeSingle();
  if(priorError)return json({error:"Could not check duplicate delivery"},503);
  if(prior?.status==="processed")return json({received:true,deduplicated:true});
  if(prior?.status==="processing")return json({received:true,processing:true},503);
  if(prior){const {error}=await receipts.update({status:"processing",last_error:null}).eq("event_key",eventKey).eq("status","failed");if(error)return json({error:"Could not retry prior event"},503);}
  else {const {error}=await receipts.insert({event_key:eventKey,event_type:type,status:"processing"});if(error)return json({received:true,deduplicated:true},503);}
  try{
   const now=new Date().toISOString();
   const {data:intent,error:intentError}=await db.schema("private").from("shieldmind_billing_intents")
    .select("id,user_id,email,plan,amount_kobo,currency,status,expires_at,provider_subscription_code")
    .eq("provider_subscription_code",reference).maybeSingle();
   if(intentError)throw new Error("intent lookup failed");
   if(!intent||!prices[intent.plan]||intent.currency!=="NGN"||intent.amount_kobo!==prices[intent.plan])throw new Error("unmatched intent");
   if(type==="charge.failed"){
    if(intent.status==="pending")await db.schema("private").from("shieldmind_billing_intents").update({status:"failed",updated_at:now}).eq("id",intent.id).eq("status","pending");
    const {error}=await receipts.update({status:"processed",processed_at:now,last_error:null}).eq("event_key",eventKey);if(error)throw new Error("receipt update failed");
    return json({received:true,failed:true});
   }
   const verify=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{Authorization:"Bearer "+secret}});
   const response=await verify.json().catch(()=>null),tx=response?.data;
   if(!verify.ok||response?.status!==true||tx?.status!=="success"||tx?.reference!==reference||Number(tx?.amount)!==intent.amount_kobo||tx?.currency!=="NGN"||String(tx?.customer?.email||"").trim().toLowerCase()!==intent.email)throw new Error("Paystack verification failed");
   // Refuse to activate an expired intent or replace a different user's paid plan.
   if(intent.status!=="pending"||!intent.expires_at||Date.parse(intent.expires_at)<=Date.now())throw new Error("intent expired or consumed");
   const {data:existing,error:existingError}=await db.from("shieldmind_subscriptions").select("plan,status,expires_at").eq("user_id",intent.user_id).maybeSingle();
   if(existingError)throw new Error("subscription lookup failed");
   if(existing?.plan&&existing.plan!=="free"&&existing.status==="active"&&existing.expires_at&&Date.parse(existing.expires_at)>Date.now())throw new Error("paid subscription already active");
   const expiry=new Date(Date.now()+30*86400000).toISOString();
   const {error:subError}=await db.from("shieldmind_subscriptions").upsert({user_id:intent.user_id,plan:intent.plan,status:"active",billing_period:"monthly",provider:"paystack",provider_reference:reference,amount_kobo:intent.amount_kobo,currency:"NGN",started_at:now,expires_at:expiry,updated_at:now,last_payment_reference:reference,last_payment_at:now,renewal_status:"not_renewing",image_upload_limit:limits[intent.plan]},{onConflict:"user_id"});
   if(subError)throw new Error("activation write failed");
   const {error:usedError}=await db.schema("private").from("shieldmind_billing_intents").update({status:"matched",updated_at:now}).eq("id",intent.id).eq("status","pending");
   if(usedError)throw new Error("intent finalization failed");
   const {error:receiptError}=await receipts.update({status:"processed",processed_at:now,last_error:null}).eq("event_key",eventKey);if(receiptError)throw new Error("receipt update failed");
   return json({received:true,activated:true,billing_mode:"prepaid",period_days:30});
  }catch(error){
   await receipts.update({status:"failed",last_error:String(error).slice(0,500)}).eq("event_key",eventKey);
   return json({error:"Billing event could not be safely reconciled"},503);
  }
 }catch{return json({error:"Webhook processing failed"},500);}
});