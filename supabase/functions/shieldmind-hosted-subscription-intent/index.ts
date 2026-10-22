import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const plans={starter:200000,plus:500000,pro:1000000,ultra:1500000,max:2800000} as const;
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const auth=req.headers.get("Authorization"),url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!auth?.startsWith("Bearer "))return json({error:"Sign in before checkout."},401);
  if(!url||!anon||!service)return json({error:"Subscription enrollment is not configured in staging."},503);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user?.email||!user.email_confirmed_at)return json({error:"A confirmed signed-in email is required."},401);
  const {data:profile,error:profileError}=await userClient.from("profiles").select("verification_status,role,requested_role").eq("id",user.id).maybeSingle();
  if(profileError||!profile||profile.verification_status!=="verified")return json({error:"Verify your campus account before subscribing."},403);
  const {data:contexts,error:contextError}=await userClient.rpc("get_my_campus_context"),ctx=Array.isArray(contexts)?contexts[0]:null;
  if(contextError||!ctx||ctx.membership_status!=="active"||ctx.verification_status!=="verified")return json({error:"Active verified campus membership is required."},403);
  if((profile.requested_role||profile.role)==="student"){
   const {data:identity,error}=await userClient.from("student_identity_verifications").select("status").eq("user_id",user.id).maybeSingle();
   if(error||identity?.status!=="approved")return json({error:"Approved student identity is required before subscribing."},403);
  }
  const body=await req.json().catch(()=>null),plan=body?.plan;
  if(typeof plan!=="string"||!Object.hasOwn(plans,plan))return json({error:"Choose a valid plan."},400);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:existing,error:existingError}=await admin.from("shieldmind_subscriptions").select("plan,status,expires_at").eq("user_id",user.id).maybeSingle();
  if(existingError)return json({error:"Could not check current subscription."},503);
  if(existing?.plan&&existing.plan!=="free"&&existing.status==="active"&&existing.expires_at&&Date.parse(existing.expires_at)>Date.now())return json({error:"An active paid plan already exists."},409);
  const now=new Date().toISOString();
  const {error:expireError}=await admin.schema("private").from("shieldmind_billing_intents").update({status:"expired",updated_at:now}).eq("user_id",user.id).eq("status","pending");
  if(expireError)return json({error:"Could not safely replace the previous intent."},503);
  const {error:insertError}=await admin.schema("private").from("shieldmind_billing_intents").insert({user_id:user.id,email:user.email.toLowerCase(),plan,amount_kobo:plans[plan as keyof typeof plans],currency:"NGN",status:"pending",expires_at:new Date(Date.now()+90*60*1000).toISOString()});
  if(insertError)return json({error:"Could not record subscription intent."},503);
  return json({ready:true,plan,amount_kobo:plans[plan as keyof typeof plans],currency:"NGN",expires_in_minutes:90});
 }catch{return json({error:"Subscription checkout could not be prepared."},500);}
});
