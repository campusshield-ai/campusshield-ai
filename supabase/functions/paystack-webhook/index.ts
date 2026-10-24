import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function hex(bytes:ArrayBuffer){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function validSignature(raw:string,signature:string,secret:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-512"},false,["sign"]);const expected=hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)));if(expected.length!==signature.length)return false;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);return diff===0;}
function reply(status:number,body:Record<string,unknown>){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply(405,{error:"Method not allowed."});
 const secret=Deno.env.get("PAYSTACK_SECRET_KEY")||"",url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!secret||!url||!service)return reply(503,{error:"Webhook is not configured."});
 const raw=await req.text(),signature=req.headers.get("x-paystack-signature")||"";
 if(!signature||!await validSignature(raw,signature,secret))return reply(401,{error:"Invalid webhook signature."});
 let event:any;try{event=JSON.parse(raw);}catch{return reply(400,{error:"Invalid JSON."});}
 const data=event?.data||{},reference=String(data.reference||"");
 if(!reference.startsWith("csa_"))return reply(200,{received:true,ignored:true});
 const db=createClient(url,service,{auth:{persistSession:false}});
 const {data:order,error:orderError}=await db.from("shieldmind_payment_orders").select("id,user_id,plan,billing_period,amount_kobo,currency,status").eq("provider_reference",reference).maybeSingle();
 if(orderError)return reply(500,{error:"Could not look up payment order."});
 if(!order)return reply(200,{received:true,ignored:true});
 if(event.event==="charge.success"){
  if(order.status==="paid")return reply(200,{received:true,duplicate:true});
  const verifyResponse=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${secret}`}});
  const confirmed=await verifyResponse.json().catch(()=>null);
  if(!verifyResponse.ok||confirmed?.status!==true||confirmed?.data?.status!=="success"||Number(confirmed?.data?.amount)!==Number(order.amount_kobo)||confirmed?.data?.currency!==order.currency)return reply(400,{error:"Paystack verification failed."});
  const now=new Date(),expiry=new Date(now.getTime()+30*24*60*60*1000);
  const {data:updated,error:updateError}=await db.from("shieldmind_payment_orders").update({status:"paid",paid_at:now.toISOString(),updated_at:now.toISOString()}).eq("id",order.id).eq("status","pending").select("id").maybeSingle();
  if(updateError)return reply(500,{error:"Could not record verified payment."});
  if(!updated){const {data:latest}=await db.from("shieldmind_payment_orders").select("status").eq("id",order.id).maybeSingle();if(latest?.status==="paid")return reply(200,{received:true,duplicate:true});return reply(409,{error:"Order is not in a payable state."});}
  const {error:subError}=await db.from("shieldmind_subscriptions").upsert({user_id:order.user_id,plan:order.plan,status:"active",billing_period:"monthly",provider:"paystack",provider_reference:reference,amount_kobo:order.amount_kobo,currency:"NGN",started_at:now.toISOString(),expires_at:expiry.toISOString(),updated_at:now.toISOString(),last_payment_reference:reference,last_payment_at:now.toISOString(),renewal_status:"not_renewing",image_upload_limit:({starter:20,plus:60,pro:150,ultra:300,max:600} as Record<string,number>)[order.plan]||0},{onConflict:"user_id"});
  if(subError)return reply(500,{error:"Payment verified but subscription activation needs reconciliation."});
  return reply(200,{received:true,activated:true});
 }
 if(event.event==="charge.failed")await db.from("shieldmind_payment_orders").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",order.id).eq("status","pending");
 return reply(200,{received:true});
});