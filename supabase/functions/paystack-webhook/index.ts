import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function hex(bytes:ArrayBuffer){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function validSignature(raw:string,signature:string,secret:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-512"},false,["sign"]);const expected=hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)));if(expected.length!==signature.length)return false;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);return diff===0;}
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const limits:Record<string,number>={starter:20,plus:60,pro:150,ultra:300,max:600};
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const secret=Deno.env.get("PAYSTACK_SECRET_KEY")||"",url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!secret||!url||!service)return json({error:"Webhook is not configured"},503);
  if(!secret.startsWith("sk_live_"))return json({error:"Production webhook is not configured with a live Paystack secret"},503);
  const raw=await req.text(),sig=req.headers.get("x-paystack-signature")||"";
  if(!sig||!await validSignature(raw,sig,secret))return json({error:"Invalid webhook signature"},401);
  let event:any;try{event=JSON.parse(raw);}catch{return json({error:"Invalid JSON"},400);}
  const type=String(event?.event||""),p=event?.data||{},reference=String(p.reference||"");
  if(!reference.startsWith("csa_"))return json({received:true,ignored:true});
  if(!["charge.success","charge.failed"].includes(type))return json({received:true,ignored:true});
  const db=createClient(url,service,{auth:{persistSession:false}});
  const {data:order,error:orderError}=await db.from("shieldmind_payment_orders").select("id,user_id,plan,billing_period,amount_kobo,currency,status").eq("provider_reference",reference).maybeSingle();
  if(orderError)return json({error:"Could not look up payment order"},503);
  if(!order)return json({received:true,ignored:true});
  if(type==="charge.failed"){
    if(order.status==="pending")await db.from("shieldmind_payment_orders").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",order.id).eq("status","pending");
    return json({received:true,failed:true});
  }
  // Avoid a second activation and verify the successful charge directly with Paystack.
  if(order.status==="paid")return json({received:true,duplicate:true});
  const vr=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{Authorization:"Bearer "+secret}});
  const payload=await vr.json().catch(()=>null),tx=payload?.data;
  if(!vr.ok||payload?.status!==true||tx?.status!=="success"||tx?.reference!==reference||Number(tx?.amount)!==order.amount_kobo||tx?.currency!==order.currency||String(tx?.customer?.email||"").toLowerCase()!==String(p.customer?.email||"").toLowerCase())return json({error:"Paystack verification failed"},400);
  if(!["starter","plus","pro","ultra","max"].includes(order.plan)||order.currency!=="NGN")return json({error:"Unsupported plan"},400);
  const now=new Date(),expiry=new Date(now.getTime()+30*86400000);
  const {data:updated,error:updateError}=await db.from("shieldmind_payment_orders").update({status:"paid",paid_at:now.toISOString(),updated_at:now.toISOString()}).eq("id",order.id).eq("status","pending").select("id").maybeSingle();
  if(updateError)return json({error:"Could not record verified payment"},503);
  if(!updated){const {data:latest}=await db.from("shieldmind_payment_orders").select("status").eq("id",order.id).maybeSingle();if(latest?.status==="paid")return json({received:true,duplicate:true});return json({error:"Order is not payable"},409);}
  const {error:subError}=await db.from("shieldmind_subscriptions").upsert({user_id:order.user_id,plan:order.plan,status:"active",billing_period:"monthly",provider:"paystack",provider_reference:reference,amount_kobo:order.amount_kobo,currency:"NGN",started_at:now.toISOString(),expires_at:expiry.toISOString(),updated_at:now.toISOString(),last_payment_reference:reference,last_payment_at:now.toISOString(),renewal_status:"not_renewing",image_upload_limit:limits[order.plan]},{onConflict:"user_id"});
  if(subError)return json({error:"Payment verified but activation needs reconciliation"},503);
  return json({received:true,activated:true,billing_mode:"prepaid",period_days:30});
 }catch{return json({error:"Webhook processing failed"},500);}
});