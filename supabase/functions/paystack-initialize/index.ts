import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_ORIGIN="https://campusshield-ai.github.io";
const cors={"Access-Control-Allow-Origin":APP_ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const prices:Record<string,number>={starter:200000,plus:500000,pro:1000000,ultra:2000000,max:2800000};
const limits:Record<string,number>={starter:20,plus:60,pro:150,ultra:300,max:600};
const json=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json(405,{error:"Method not allowed."});
 if((req.headers.get("origin")||"")!==APP_ORIGIN)return json(403,{error:"This checkout origin is not allowed."});
 try{
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"",anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",paystackKey=Deno.env.get("PAYSTACK_SECRET_KEY")||"";
  if(!supabaseUrl||!anonKey||!serviceKey||!paystackKey)return json(503,{error:"Secure billing is not configured. No payment has been taken."});
  if(!/^sk_live_/.test(paystackKey))return json(409,{error:"Production checkout requires your Paystack live secret in production Supabase. No charge was started."});
  const token=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return json(401,{error:"Sign in before starting a subscription."});
  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await userClient.auth.getUser(token);
  if(userError||!user?.id||!user.email||!user.email_confirmed_at)return json(401,{error:"A confirmed signed-in email is required."});
  const {data:profile,error:profileError}=await userClient.from("profiles").select("role,verification_status").eq("id",user.id).maybeSingle();
  if(profileError||!profile||profile.verification_status!=="verified")return json(403,{error:"Verify your campus account before upgrading."});
  const {data:contexts,error:contextError}=await userClient.rpc("get_my_campus_context"),ctx=Array.isArray(contexts)?contexts[0]:null;
  if(contextError||!ctx||ctx.membership_status!=="active"||ctx.verification_status!=="verified")return json(403,{error:"Active verified campus membership is required."});
  if(String(profile.role||"").toLowerCase()==="student"){
   const {data:identity,error}=await userClient.from("student_identity_verifications").select("status").eq("user_id",user.id).maybeSingle();
   if(error||identity?.status!=="approved")return json(403,{error:"Approved student identity is required before upgrading."});
  }
  let input:any;try{input=await req.json();}catch{return json(400,{error:"Invalid request."});}
  const plan=String(input?.plan||"").toLowerCase(),amount=prices[plan];
  if(!amount||input?.billing_period!=="monthly")return json(400,{error:"Choose a valid monthly ShieldMind plan."});
  const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:existing,error:existingError}=await db.from("shieldmind_subscriptions").select("plan,status,expires_at").eq("user_id",user.id).maybeSingle();
  if(existingError)return json(503,{error:"Could not check current subscription."});
  if(existing?.plan&&existing.plan!=="free"&&existing.status==="active"&&existing.expires_at&&Date.parse(existing.expires_at)>Date.now())return json(409,{error:"You already have an active paid plan."});
  const reference="csa_"+crypto.randomUUID().replaceAll("-","");
  const init=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:`Bearer ${paystackKey}`,"Content-Type":"application/json"},body:JSON.stringify({email:user.email,amount,currency:"NGN",reference,callback_url:APP_ORIGIN+"/campusshield-ai/?billing=return",metadata:{user_id:user.id,plan,billing_period:"monthly_prepaid",period_days:30,application:"CampusShield AI"}})});
  const payload=await init.json().catch(()=>null);
  if(!init.ok||payload?.status!==true||!payload?.data?.authorization_url)return json(502,{error:"Paystack could not create a live checkout. No subscription was activated."});
  const {error:insertError}=await db.from("shieldmind_payment_orders").insert({user_id:user.id,plan,billing_period:"monthly",amount_kobo:amount,currency:"NGN",provider:"paystack",provider_reference:reference,status:"pending",authorization_url:payload.data.authorization_url});
  if(insertError)return json(503,{error:"Could not safely record the payment request. No payment was activated."});
  return json(200,{authorization_url:payload.data.authorization_url,reference,amount_kobo:amount,currency:"NGN",plan,period_days:30,billing_mode:"prepaid"});
 }catch{return json(500,{error:"Secure checkout failed. No subscription was activated."});}
});