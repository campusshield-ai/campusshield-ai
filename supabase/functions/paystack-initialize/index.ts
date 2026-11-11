import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_APP_ORIGIN = "https://campusshield-ai.github.io";
const DEFAULT_APP_PATH = "/campusshield-ai/";
const ALLOWED_APP_ORIGINS = new Set([
  DEFAULT_APP_ORIGIN,
  "https://campusshield-ai-staging-preview.vercel.app",
  ...(Deno.env.get("CAMPUSSHIELD_APP_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean)
]);
const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
});
function getAllowedOrigin(request: Request): string | null {
  const raw = (request.headers.get("origin") || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.origin !== raw) return null;
    return ALLOWED_APP_ORIGINS.has(parsed.origin) ? parsed.origin : null;
  } catch {
    return null;
  }
}
function getPaymentReturnUrl(origin: string): string {
  const path = origin === DEFAULT_APP_ORIGIN ? DEFAULT_APP_PATH : "/";
  const url = new URL(path, origin);
  url.searchParams.set("billing", "return");
  return url.toString();
}
const prices:Record<string,number>={starter:200000,plus:500000,pro:1000000,ultra:2000000,max:2800000};
const limits:Record<string,number>={starter:20,plus:60,pro:150,ultra:300,max:600};
const json=(status:number,body:Record<string,unknown>,origin=DEFAULT_APP_ORIGIN)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
 const origin=getAllowedOrigin(req);
 const send=(status:number,body:Record<string,unknown>)=>json(status,body,origin||DEFAULT_APP_ORIGIN);
 if(!origin)return send(403,{error:"This checkout origin is not allowed. Open CampusShield from its official website address."});
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
 if(req.method!=="POST")return send(405,{error:"Method not allowed."});
 try{
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"",anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",paystackKey=Deno.env.get("PAYSTACK_SECRET_KEY")||"";
  if(!supabaseUrl||!anonKey||!serviceKey||!paystackKey)return send(503,{error:"Secure billing is not configured. No payment has been taken."});
  if(!/^sk_live_/.test(paystackKey))return send(409,{error:"Production checkout requires your Paystack live secret in production Supabase. No charge was started."});
  const token=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return send(401,{error:"Sign in before starting a subscription."});
  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await userClient.auth.getUser(token);
  if(userError||!user?.id||!user.email||!user.email_confirmed_at)return send(401,{error:"A confirmed signed-in email is required."});
  // Any confirmed, signed-in account may purchase a personal ShieldMind plan.
  // Campus membership, profile verification, and student-ID review are not required for checkout.
  let input:any;try{input=await req.json();}catch{return send(400,{error:"Invalid request."});}
  const plan=String(input?.plan||"").toLowerCase(),amount=prices[plan];
  if(!amount||input?.billing_period!=="monthly")return send(400,{error:"Choose a valid monthly ShieldMind plan."});
  const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:existing,error:existingError}=await db.from("shieldmind_subscriptions").select("plan,status,expires_at").eq("user_id",user.id).maybeSingle();
  if(existingError)return send(503,{error:"Could not check current subscription."});
  if(existing?.plan&&existing.plan!=="free"&&existing.status==="active"&&existing.expires_at&&Date.parse(existing.expires_at)>Date.now())return send(409,{error:"You already have an active paid plan."});
  const reference="csa_"+crypto.randomUUID().replaceAll("-","");
  const init=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:`Bearer ${paystackKey}`,"Content-Type":"application/json"},body:JSON.stringify({email:user.email,amount,currency:"NGN",reference,callback_url:getPaymentReturnUrl(origin),metadata:{user_id:user.id,plan,billing_period:"monthly_prepaid",period_days:30,application:"CampusShield AI"}})});
  const payload=await init.json().catch(()=>null);
  if(!init.ok||payload?.status!==true||!payload?.data?.authorization_url)return send(502,{error:"Paystack could not create a live checkout. No subscription was activated."});
  const {error:insertError}=await db.from("shieldmind_payment_orders").insert({user_id:user.id,plan,billing_period:"monthly",amount_kobo:amount,currency:"NGN",provider:"paystack",provider_reference:reference,status:"pending",authorization_url:payload.data.authorization_url});
  if(insertError)return send(503,{error:"Could not safely record the payment request. No payment was activated."});
  return send(200,{authorization_url:payload.data.authorization_url,reference,amount_kobo:amount,currency:"NGN",plan,period_days:30,billing_mode:"prepaid"});
 }catch{return send(500,{error:"Secure checkout failed. No subscription was activated."});}
});