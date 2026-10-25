import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const DEFAULT_APP_ORIGIN="https://campusshield-ai.github.io";
const cors=(origin:string)=>({"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const plans={starter:{amount:200000,limit:20},plus:{amount:500000,limit:60},pro:{amount:1000000,limit:150},ultra:{amount:2000000,limit:300},max:{amount:2800000,limit:600}} as const;
const json=(body:Record<string,unknown>,status=200,origin=DEFAULT_APP_ORIGIN)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
 const origin=(req.headers.get("origin")||"").replace(/\/$/,"");
 const configuredOrigin=(Deno.env.get("CAMPUSSHIELD_APP_ORIGIN")||"").replace(/\/$/,"");
 const isLocalPreview=/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
 const isAllowed=Boolean(origin)&&(configuredOrigin?origin===configuredOrigin:(origin===DEFAULT_APP_ORIGIN||isLocalPreview));
 const send=(body:Record<string,unknown>,status=200)=>json(body,status,origin||DEFAULT_APP_ORIGIN);
 if(!isAllowed)return send({error:"Checkout origin is not allowed. Configure CAMPUSSHIELD_APP_ORIGIN for this staging preview."},403);
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
 if(req.method!=="POST")return send({error:"Method not allowed."},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",paystack=Deno.env.get("PAYSTACK_SECRET_KEY")||"";
  if(!url||!anon||!service||!paystack)return send({error:"Staging billing is not configured."},503);
  if(!paystack.startsWith("sk_test_"))return send({error:"Staging only accepts a Paystack test secret. Live payments are disabled."},409);
  const token=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return send({error:"Sign in before checkout."},401);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await userClient.auth.getUser(token);
  if(userError||!user?.id||!user.email||!user.email_confirmed_at)return send({error:"A confirmed signed-in email is required."},401);
  // Any signed-in account with a confirmed email may purchase a ShieldMind prepaid plan.
  // Campus verification remains relevant to campus-only features, not billing eligibility.
  const body=await req.json().catch(()=>null),planKey=body?.plan;
  if(typeof planKey!=="string"||!Object.hasOwn(plans,planKey))return send({error:"Choose a valid monthly plan."},400);
  const plan=plans[planKey as keyof typeof plans],db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:existing,error:existingError}=await db.from("shieldmind_subscriptions").select("plan,status,expires_at").eq("user_id",user.id).maybeSingle();
  if(existingError)return send({error:"Could not check current subscription."},503);
  if(existing?.plan&&existing.plan!=="free"&&existing.status==="active"&&existing.expires_at&&Date.parse(existing.expires_at)>Date.now())return send({error:"A paid plan is already active. Renew after it expires or use subscription management."},409);
  const now=new Date().toISOString();
  const {error:expireError}=await db.schema("private").from("shieldmind_billing_intents").update({status:"expired",updated_at:now}).eq("user_id",user.id).eq("status","pending");
  if(expireError)return send({error:"Could not safely replace the previous billing intent."},503);
  const {error:intentError}=await db.schema("private").from("shieldmind_billing_intents").insert({user_id:user.id,email:user.email.toLowerCase(),plan:planKey,amount_kobo:plan.amount,currency:"NGN",status:"pending",expires_at:new Date(Date.now()+90*60*1000).toISOString()});
  if(intentError)return send({error:"Could not record the payment intent."},503);
  const reference="sm_"+crypto.randomUUID().replaceAll("-","");
  const init=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:`Bearer ${paystack}`,"Content-Type":"application/json"},body:JSON.stringify({email:user.email,amount:plan.amount,currency:"NGN",reference,callback_url:(()=>{const p=(Deno.env.get("CAMPUSSHIELD_APP_PATH")||(origin===DEFAULT_APP_ORIGIN?"/campusshield-ai/":"/"));const path=/^\/[A-Za-z0-9/_-]*\/?$/.test(p)?p:"/";const u=new URL(path,origin);u.searchParams.set("billing","return");return u.toString();})(),metadata:{user_id:user.id,product:"shieldmind_tier",plan:planKey,billing_period:"monthly_prepaid",period_days:30,amount_kobo:plan.amount,image_upload_limit:plan.limit}})});
  const payload=await init.json().catch(()=>null);
  if(!init.ok||payload?.status!==true||!payload?.data?.authorization_url){
   await db.schema("private").from("shieldmind_billing_intents").update({status:"failed",updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("status","pending");
   return send({error:"Paystack test checkout could not start. No subscription was activated."},502);
  }
  const {error:bindError}=await db.schema("private").from("shieldmind_billing_intents").update({provider_subscription_code:reference,updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("status","pending").eq("plan",planKey);
  if(bindError)return send({error:"Could not bind checkout to its private intent."},503);
  return send({checkout_url:payload.data.authorization_url,authorization_url:payload.data.authorization_url,reference,amount_kobo:plan.amount,currency:"NGN",plan:planKey,period_days:30,billing_mode:"prepaid",mode:"test"});
 }catch{return send({error:"Checkout unavailable; no subscription was activated."},500);}
});