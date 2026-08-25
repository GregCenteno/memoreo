// Versión para Netlify Functions de POST /api/create-checkout-session (ver
// server/index.js para la versión Express — hacen exactamente lo mismo,
// esta es la que corre cuando la app se despliega en Netlify en vez de un
// servidor propio; ver README.md, "Desplegar en Netlify").
import Stripe from 'stripe';
import { json, siteUrl } from './_shared.mjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const PRICE_IDS = {
  premium: process.env.STRIPE_PRICE_PREMIUM,
  premium_plus: process.env.STRIPE_PRICE_PREMIUM_PLUS
};

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!process.env.STRIPE_SECRET_KEY) {
    return json({ error: 'STRIPE_SECRET_KEY no está configurada en las variables de entorno de Netlify.' }, 500);
  }
  try {
    const { accountId, email, plan, trial } = await req.json();
    if (!accountId || !plan) return json({ error: 'Falta accountId o plan.' }, 400);
    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return json({
        error: `No hay un Price de Stripe configurado para "${plan}" — revisa STRIPE_PRICE_PREMIUM / STRIPE_PRICE_PREMIUM_PLUS en las variables de entorno del sitio de Netlify.`
      }, 400);
    }

    const base = siteUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: accountId,
      customer_email: email || undefined,
      subscription_data: {
        metadata: { accountId, plan },
        ...(trial ? { trial_period_days: 7 } : {})
      },
      metadata: { accountId, plan },
      success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?checkout=cancelled`
    });
    return json({ url: session.url });
  } catch (err) {
    return json({ error: err.message || 'No se pudo crear la sesión de Stripe.' }, 500);
  }
};
