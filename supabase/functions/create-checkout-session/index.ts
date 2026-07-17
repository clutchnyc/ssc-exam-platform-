// create-checkout-session — starts a Stripe Checkout for a consumer course.
//
// Input:  { course_id }
// Output: { url } (Stripe-hosted checkout) | { already_enrolled: true }
//
// The price comes from courses.price_cents SERVER-SIDE — a client-supplied
// price is never trusted. A pending payments row is recorded here; the
// stripe-webhook function flips it to paid and activates the enrollment
// once Stripe confirms the charge.
//
// Secrets: STRIPE_SECRET_KEY

import Stripe from "npm:stripe@16";
import { adminClient, corsHeaders, getUser, json } from "../_shared/mod.ts";

const FALLBACK_ORIGIN = "https://ssc-exams.netlify.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Not authenticated" }, 401);

    const { course_id } = await req.json().catch(() => ({}));
    if (!course_id) return json({ error: "course_id is required" }, 400);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("create-checkout-session: STRIPE_SECRET_KEY not set");
      return json({ error: "Payments not configured" }, 500);
    }

    const db = adminClient();

    const { data: course } = await db
      .from("courses")
      .select("id, slug, title, track, price_cents, is_published")
      .eq("id", course_id)
      .maybeSingle();
    if (!course || !course.is_published) return json({ error: "Course not found" }, 404);
    if (course.track !== "consumer" || course.price_cents == null || course.price_cents < 50) {
      return json({ error: "This course is not purchasable." }, 400);
    }

    // Already enrolled? Nothing to buy.
    const { data: existing } = await db
      .from("course_enrollments")
      .select("id, status")
      .eq("profile_id", user.id)
      .eq("course_id", course.id)
      .eq("status", "active")
      .maybeSingle();
    if (existing) return json({ already_enrolled: true });

    const origin = req.headers.get("origin") ?? FALLBACK_ORIGIN;
    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: course.title },
          unit_amount: course.price_cents,
        },
        quantity: 1,
      }],
      customer_email: user.email,
      metadata: { profile_id: user.id, course_id: course.id },
      success_url: `${origin}/enroll/${course.slug}?status=success`,
      cancel_url: `${origin}/enroll/${course.slug}?status=cancelled`,
    });

    const { error: payErr } = await db.from("payments").insert({
      profile_id: user.id,
      course_id: course.id,
      stripe_session_id: session.id,
      amount_cents: course.price_cents,
      status: "pending",
    });
    if (payErr) throw payErr;

    return json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
