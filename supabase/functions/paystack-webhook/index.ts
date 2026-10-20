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
    if (event?.event !== "charge.success" || !event?.data?.reference) return json({received:true});
    const reference = String(event.data.reference);
    const admin = createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
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
