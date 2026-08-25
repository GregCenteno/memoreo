// Versión para Netlify Functions de GET /api/checkout-status (ver
// server/index.js). Se llama al volver de Stripe Checkout — es el único
// lugar donde el frontend recibe luz verde para activar un plan de paga, y
// solo si Stripe confirma aquí mismo que de verdad se pagó o empezó una
// prueba (ver handleCheckoutReturn en src/app.js).
import Stripe from 'stripe';
import { json, capitalize } from './_shared.mjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

export default async (req) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return json({ ok: false, error: 'STRIPE_SECRET_KEY no está configurada en las variables de entorno de Netlify.' }, 500);
  }
  const sessionId = new URL(req.url).searchParams.get('session_id');
  if (!sessionId) return json({ ok: false, error: 'Falta session_id.' }, 400);
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'subscription.default_payment_method']
    });
    const sub = session.subscription;
    const paid = session.payment_status === 'paid' || session.status === 'complete';
    const trialing = sub && sub.status === 'trialing';
    if (!paid && !trialing) return json({ ok: false });

    const pm = sub && sub.default_payment_method && sub.default_payment_method.card;
    return json({
      ok: true,
      active: true,
      plan: (session.metadata && session.metadata.plan) || null,
      trialEndsAt: trialing && sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      paymentMethod: pm ? { brand: capitalize(pm.brand), last4: pm.last4 } : null,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: sub ? sub.id : null
    });
  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
};
