import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://campusshield-ai.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const prices: Record<string, number> = { starter:200000, plus:500000, pro:1000000, ultra:2000000, max:2800000 };
function reply(status:number,body:Record<string,unknown>){return new Response(JSON.stringify(body),{status,headers:corsHeaders});}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return reply(405,{error:"Method not allowed."});
 if((req.headers.get("origin")||"")!=="https://campusshield-ai.github.io")return reply(403,{error:"This checkout origin is not allowed."});
 const supabaseUrl=Deno.env.get("SUPABASE_URL")||"", anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"", serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"", paystackKey=Deno.env.get("PAYSTACK_SECRET_KEY")||"";
 if(!supabaseUrl||!anonKey||!serviceKey)return reply(503,{error:"Secure billing service is not configured."});
 if(!/^sk_(test|live)_/.test(paystackKey))return reply(503,{error:"Paystack checkout is not configured yet. No payment has been taken."});
 const authorization=req.headers.get("authorization")||"", token=authorization.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return reply(401,{error:"Sign in before starting a subscription."});
 const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const {data:userData,error:userError}=await userClient.auth.getUser(token);
 if(userError||!userData.user?.id||!userData.user.email)return reply(401,{error:"Your session could not be verified. Please sign in again."});
 let input:{plan?:string;billing_period?:string};try{input=await req.json();}catch{return reply(400,{error:"Invalid request."});}
 const plan=String(input.plan||"").toLowerCase(),amount=prices[plan];
 if(!amount||input.billing_period!=="monthly")return reply(400,{error:"Choose a valid monthly ShieldMind plan."});
 const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
 const reference=`csa_${crypto.randomUUID().replaceAll("-","")}`;
 const init=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:`Bearer ${paystackKey}`,"Content-Type":"application/json"},body:JSON.stringify({email:userData.user.email,amount,currency:"NGN",reference,callback_url:"https://campusshield-ai.github.io/campusshield-ai/?billing=return",metadata:{user_id:userData.user.id,plan,billing_period:"monthly",application:"CampusShield AI"}})});
 const payload=await init.json().catch(()=>({}));
 if(!init.ok||payload?.status!==true||!payload?.data?.authorization_url)return reply(502,{error:"Paystack could not start checkout. No subscription was activated."});
 const {error:insertError}=await db.from("shieldmind_payment_orders").insert({user_id:userData.user.id,plan,billing_period:"monthly",amount_kobo:amount,currency:"NGN",provider_reference:reference,status:"pending",authorization_url:payload.data.authorization_url});
 if(insertError)return reply(500,{error:"Could not record the payment request. No subscription was activated."});
 return reply(200,{authorization_url:payload.data.authorization_url,reference,status:"pending"});
});