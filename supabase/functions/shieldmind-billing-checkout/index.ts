import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: Record<string, unknown>, status=200) => new Response(JSON.stringify(body), {status, headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const plans = {
  starter: { amount: 200000, label: "ShieldMind Starter monthly", days: 30, imageLimit: 20 },
  plus: { amount: 500000, label: "ShieldMind Plus monthly", days: 30, imageLimit: 60 },
  pro: { amount: 1000000, label: "ShieldMind Pro monthly", days: 30, imageLimit: 150 },
  ultra: { amount: 1500000, label: "ShieldMind Ultra monthly", days: 30, imageLimit: 300 },
  max: { amount: 2800000, label: "ShieldMind Max monthly", days: 30, imageLimit: 600 },
} as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers:cors});
  if (req.method !== "POST") return json({error:"Method not allowed"},405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({error:"Sign in to upgrade."},401);
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), paystack = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!url || !anon || !service || !paystack) return json({error:"Premium checkout is not configured in staging yet."},503);
    // Staging must never initialize a live charge.
    if (!paystack.startsWith("sk_test_")) return json({error:"Staging checkout requires a Paystack test secret (sk_test_). Live charges are disabled here."},409);
    const userClient = createClient(url, anon, {global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError} = await userClient.auth.getUser();
    if (userError || !user?.email) return json({error:"A verified signed-in email is required."},401);
    const {data:profile,error:profileError} = await userClient.from("profiles").select("verification_status,role,requested_role").eq("id",user.id).maybeSingle();
    if (profileError || !profile || profile.verification_status !== "verified") return json({error:"Verify your campus account before upgrading."},403);
    const {data:contexts,error:contextError} = await userClient.rpc("get_my_campus_context");
    const context = Array.isArray(contexts) ? contexts[0] : null;
    if (contextError || !context || context.membership_status !== "active" || context.verification_status !== "verified") return json({error:"Active verified campus membership is required."},403);
    const isStudent = String(profile.role || "").toLowerCase() === "student";
    if (isStudent) {
      const {data:identity,error:identityError} = await userClient.from("student_identity_verifications").select("status").eq("user_id",user.id).maybeSingle();
      if (identityError || identity?.status !== "approved") return json({error:"Approved student identity is required before upgrading."},403);
    }
    const body = await req.json().catch(()=>null);
    const planKey = body?.plan;
    if (typeof planKey !== "string" || !(planKey in plans)) return json({error:"Choose a valid monthly plan."},400);
    const plan = plans[planKey as keyof typeof plans];
    const admin = createClient(url, service, {auth:{persistSession:false,autoRefreshToken:false}});
    const {data:existing} = await admin.from("shieldmind_subscriptions").select("plan,status,expires_at").eq("user_id",user.id).maybeSingle();
    if (existing?.plan && existing.plan !== "free" && existing.status === "active" && existing.expires_at && new Date(existing.expires_at).getTime() > Date.now()) return json({error:"Your paid plan is already active. Plan changes can be added after the pilot."},409);
    const reference = "sm_" + crypto.randomUUID().replaceAll("-","");
    const response = await fetch("https://api.paystack.co/transaction/initialize", {method:"POST",headers:{"Authorization":`Bearer ${paystack}`,"Content-Type":"application/json"},body:JSON.stringify({email:user.email,amount:plan.amount,currency:"NGN",reference,callback_url:"https://campusshield-ai.github.io/campusshield-ai/?billing=return",metadata:{user_id:user.id,product:"shieldmind_tier",plan:planKey,period:"monthly",plan_amount_kobo:plan.amount,image_upload_limit:plan.imageLimit},label:plan.label})});
    const result = await response.json().catch(()=>null);
    if (!response.ok || result?.status !== true || !result?.data?.authorization_url) return json({error:"Paystack could not start checkout. Please try again."},502);
    const {error:saveError} = await admin.from("shieldmind_subscriptions").upsert({user_id:user.id,plan:planKey,status:"pending",billing_period:"monthly",provider:"paystack",provider_reference:reference,amount_kobo:plan.amount,currency:"NGN",image_upload_limit:plan.imageLimit,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    if (saveError) return json({error:"Checkout could not be recorded safely. Please try again."},503);
    return json({checkout_url:result.data.authorization_url,reference,amount_kobo:plan.amount,currency:"NGN",plan:planKey,period:"monthly"});
  } catch (_e) { return json({error:"Checkout is unavailable. Please try again later."},500); }
});
