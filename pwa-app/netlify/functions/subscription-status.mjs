// Versión para Netlify Functions de GET /api/subscription-status (ver
// server/index.js). Se llama al volver del portal de facturación, para
// reflejar en la cuenta local lo que de verdad quedó en Stripe (por
// ejemplo, una cancelación).
import Stripe from 'stripe';
import { json, capitalize } from './_shared.mjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const PRICE_IDS = {
  premium: process.env.STRIPE_PRICE_PREMIUM,
  premium_plus: process.env.STRIPE_PRICE_PREMIUM_PLUS
};

export default async (req) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return json({ ok: false, error: 'STRIPE_SECRET_KEY no está configurada en las variables de entorno de Netlify.' }, 500);
  }
  const subscriptionId = new URL(req.url).searchParams.get('subscription_id');
  if (!subscriptionId) return json({ ok: false, error: 'Falta subscription_id.' }, 400);
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['default_payment_method'] });
    const active = sub.status === 'active' || sub.status === 'trialing';
    const pm = sub.default_payment_method && sub.default_payment_method.card;
    return json({
      ok: true,
      active,
      plan: (sub.metadata && sub.metadata.plan) || guessPlanFromPrice(sub),
      trialEndsAt: sub.status === 'trialing' && sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      paymentMethod: pm ? { brand: capitalize(pm.brand), last4: pm.last4 } : null,
      stripeCustomerId: sub.customer,
      stripeSubscriptionId: sub.id
    });
  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
};

function guessPlanFromPrice(sub) {
  const priceId = sub.items && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id;
  if (priceId === PRICE_IDS.premium_plus) return 'premium_plus';
  if (priceId === PRICE_IDS.premium) return 'premium';
  return 'gratis';
}
