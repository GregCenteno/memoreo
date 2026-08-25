// Versión para Netlify Functions de POST /api/create-portal-session (ver
// server/index.js). Abre el portal de facturación de Stripe: cancelar o
// cambiar de tarjeta de verdad vive ahí, no en una hoja propia de Memoreo.
import Stripe from 'stripe';
import { json, siteUrl } from './_shared.mjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!process.env.STRIPE_SECRET_KEY) {
    return json({ error: 'STRIPE_SECRET_KEY no está configurada en las variables de entorno de Netlify.' }, 500);
  }
  try {
    const { customerId } = await req.json();
    if (!customerId) return json({ error: 'Falta customerId.' }, 400);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl(req)}/?portal=return`
    });
    return json({ url: session.url });
  } catch (err) {
    return json({ error: err.message || 'No se pudo abrir el portal de Stripe.' }, 500);
  }
};
