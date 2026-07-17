// stripe-webhook — Stripe calls this on checkout events; the ONLY writer
// of paid payments and payment-driven enrollments.
//
// Deployed with --no-verify-jwt (Stripe can't send a Supabase JWT);
// authenticity comes from the Stripe signature check instead.
//
// checkout.session.completed →
//   payments.status = 'paid' (+ paid_at), then course_enrollments upsert
//   (status 'active') for the metadata's profile/course. Idempotent:
//   replayed events re-run both writes harmlessly.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

import Stripe from "npm:stripe@16";
import { adminClient, json } from "../_shared/mod.ts";

Deno.serve(async (req) => {
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeKey || !webhookSecret) {
      console.error("stripe-webhook: STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET not set");
      return json({ error: "Not configured" }, 500);
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) return json({ error: "Missing signature" }, 400);

    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const body = await req.text();
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch (err) {
      console.error("stripe-webhook: signature verification failed:", err);
      return json({ error: "Invalid signature" }, 400);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const profileId = session.metadata?.profile_id;
      const courseId = session.metadata?.course_id;

      const db = adminClient();

      const { error: payErr } = await db
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("stripe_session_id", session.id);
      if (payErr) throw payErr;

      if (profileId && courseId) {
        const { error: enrErr } = await db
          .from("course_enrollments")
          .upsert(
            { profile_id: profileId, course_id: courseId, status: "active" },
            { onConflict: "profile_id,course_id" },
          );
        if (enrErr) throw enrErr;
      } else {
        console.error("stripe-webhook: session missing metadata", session.id);
      }
    }

    return json({ received: true });
  } catch (err) {
    console.error("stripe-webhook error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
