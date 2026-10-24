import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const APP_ORIGIN="https://campusshield-ai.github.io";
const cors={"Access-Control-Allow-Origin":APP_ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const plans={starter:{amount:200000,limit:20},plus:{amount:500000,limit:60},pro:{amount:1000000,limit:150},ultra:{amount:2000000,limit:300},max:{amount:2800000,limit:600}} as const;
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed."},405);
 if((req.headers.get("origin")||"")!==APP_ORIGIN)return json({error:"Checkout origin is not allowed."},403);
 try{
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",paystack=Deno.env.get("PAYSTACK_SECRET_KEY")||"";
  if(!url||!anon||!service||!paystack)return json({error:"Staging billing is not configured."},503);
  if(!paystack.startsWith("sk_test_"))return json({error:"Staging only accepts a Paystack test secret. Live payments are disabled."},409);
  const token=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return json({error:"Sign in before checkout."},401);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await userClient.auth.getUser(token);
  if(userError||!user?.id||!user.email||!user.email_confirmed_at)return json({error:"A confirmed signed-in email is required."},401);
  const {data:profile,error:profileError}=await userClient.from("profiles").select("role,verification_status").eq("id",user.id).maybeSingle();
  if(profileError||!profile||profile.verification_status!=="verified")return json({error:"Verify your campus account before upgrading."},403);
  const {data:contexts,error:contextError}=await userClient.rpc("get_my_campus_context"),ctx=Array.isArray(contexts)?contexts[0]:null;
  if(contextError||!ctx||ctx.membership_status!=="active"||ctx.verification_status!=="verified")return json({error:"Active verified campus membership is required."},403);
  if(String(profile.role||"").toLowerCase()==="student"){
   const {data:identity,error}=await userClient.from("student_identity_verifications").select("status").eq("user_id",user.id).maybeSingle();
   if(error||identity?.status!=="approved")return json({error:"Approved student identity is required before upgrading."},403);
  }
  const body=await req.json().catch(()=>null),planKey=body?.plan;
  if(typeof planKey!=="string"||!Object.hasOwn(plans,planKey))return json({error:"Choose a valid monthly plan."},400);
  const plan=plans[planKey as keyof typeof plans],db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:existing,error:existingError}=await db.from("shieldmind_subscriptions").select("plan,status,expires_at").eq("user_id",user.id).maybeSingle();
  if(existingError)return json({error:"Could not check current subscription."},503);
  if(existing?.plan&&existing.plan!=="free"&&existing.status==="active"&&existing.expires_at&&Date.parse(existing.expires_at)>Date.now())return json({error:"A paid plan is already active. Renew after it expires or use subscription management."},409);
  const now=new Date().toISOString();
  const {error:expireError}=await db.schema("private").from("shieldmind_billing_intents").update({status:"expired",updated_at:now}).eq("user_id",user.id).eq("status","pending");
  if(expireError)return json({error:"Could not safely replace the previous billing intent."},503);
  const {error:intentError}=await db.schema("private").from("shieldmind_billing_intents").insert({user_id:user.id,email:user.email.toLowerCase(),plan:planKey,amount_kobo:plan.amount,currency:"NGN",status:"pending",expires_at:new Date(Date.now()+90*60*1000).toISOString()});
  if(intentError)return json({error:"Could not record the payment intent."},503);
  const reference="sm_"+crypto.randomUUID().replaceAll("-","");
  const init=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:`Bearer ${paystack}`,"Content-Type":"application/json"},body:JSON.stringify({email:user.email,amount:plan.amount,currency:"NGN",reference,callback_url:APP_ORIGIN+"/campusshield-ai/?billing=return",metadata:{user_id:user.id,product:"shieldmind_tier",plan:planKey,billing_period:"monthly_prepaid",period_days:30,amount_kobo:plan.amount,image_upload_limit:plan.limit}})});
  const payload=await init.json().catch(()=>null);
  if(!init.ok||payload?.status!==true||!payload?.data?.authorization_url){
   await db.schema("private").from("shieldmind_billing_intents").update({status:"failed",updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("status","pending");
   return json({error:"Paystack test checkout could not start. No subscription was activated."},502);
  }
  const {error:bindError}=await db.schema("private").from("shieldmind_billing_intents").update({provider_subscription_code:reference,updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("status","pending").eq("plan",planKey);
  if(bindError)return json({error:"Could not bind checkout to its private intent."},503);
  return json({checkout_url:payload.data.authorization_url,authorization_url:payload.data.authorization_url,reference,amount_kobo:plan.amount,currency:"NGN",plan:planKey,period_days:30,billing_mode:"prepaid",mode:"test"});
 }catch{return json({error:"Checkout unavailable; no subscription was activated."},500);}
});