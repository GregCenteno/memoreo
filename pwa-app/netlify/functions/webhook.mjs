// Versión para Netlify Functions de POST /api/webhook (ver server/index.js).
// A diferencia de Express, aquí el cuerpo crudo para verificar la firma se
// obtiene con `await req.text()` — no hace falta ninguna configuración
// especial de "raw body" como en Express.
//
// Documentos y cuentas viven de verdad en Supabase (ver supabase/schema.sql
// y src/auth.js) — este webhook actualiza el plan directo en
// public.profiles cuando Stripe confirma un cambio, para que quede correcto
// aunque el cambio no haya pasado por el navegador de la persona (por
// ejemplo, si cancelas la suscripción directamente desde el dashboard de
// Stripe, o si un cobro de renovación falla). El plan que ve CADA usuario en
// su propia sesión también viene de checkout-status.mjs /
// subscription-status.mjs cuando el navegador vuelve de Stripe — este
// webhook es el respaldo para cuando eso no pasó.
//
// A propósito nunca CREA un perfil nuevo aquí — si accountId no corresponde
// a ningún renglón existente en profiles, este webhook no hace nada (los
// perfiles solo se crean vía el trigger on_auth_user_created al registrarse,
// ver schema.sql). Y una falla al escribir en Supabase nunca convierte esto
// en un error 500 — Stripe reintentaría el webhook indefinidamente por algo
// que no tiene nada que ver con si el evento en sí era válido.
import Stripe from 'stripe';
import { supabaseAdmin } from './_shared.mjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

async function updateTrackedPlan(accountId, plan) {
  if (!accountId || !plan) return;
  try {
    const admin = supabaseAdmin();
    const patch = { plan };
    if (plan === 'gratis') patch.trial_ends_at = null;
    const { error } = await admin.from('profiles').update(patch).eq('id', accountId);
    if (error) throw error;
  } catch (err) {
    console.error(`No se pudo actualizar el plan en Supabase para accountId=${accountId}:`, err.message);
  }
}

export default async (req) => {
  const sig = req.headers.get('stripe-signature');
  const rawBody = await req.text();
  let event;
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET no configurada');
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook inválido:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      console.log(`✓ checkout.session.completed — accountId=${s.client_reference_id} customer=${s.customer} subscription=${s.subscription}`);
      const plan = s.metadata && s.metadata.plan;
      if (s.payment_status === 'paid' || s.status === 'complete') {
        await updateTrackedPlan(s.client_reference_id, plan);
      }
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      console.log(`✓ ${event.type} — subscription=${sub.id} status=${sub.status}`);
      const accountId = sub.metadata && sub.metadata.accountId;
      const plan = sub.metadata && sub.metadata.plan;
      if (sub.status === 'active' || sub.status === 'trialing') {
        await updateTrackedPlan(accountId, plan);
      } else if (sub.status === 'canceled' || sub.status === 'unpaid') {
        await updateTrackedPlan(accountId, 'gratis');
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      console.log(`✓ ${event.type} — subscription=${sub.id} status=${sub.status}`);
      const accountId = sub.metadata && sub.metadata.accountId;
      await updateTrackedPlan(accountId, 'gratis');
      break;
    }
    default:
      break;
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
