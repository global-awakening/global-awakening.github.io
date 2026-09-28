/**
 * send-account-email — crea il token di reset o di accesso e lo spedisce.
 *
 * Perché sul server: un token d'accesso deve nascere dove chi lo chiede non può vederlo. Qui lo crea il database
 * (crea_token_account, eseguibile solo con la chiave di servizio) e l'email parte con la
 * chiave privata di EmailJS, che vive solo fra i segreti.
 *
 * Risponde {ok:true} anche quando non spedisce (email sconosciuta, troppe richieste): la
 * risposta non deve dire chi è iscritto.
 */
// Versione FISSATA, come alert-cron: senza, un aggiornamento a monte può rompere il deploy.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { validaRichiesta, parametriEmail, ORIGINI_AMMESSE } from './email.mjs';

function cors(req: Request): Record<string, string> {
  const origine = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINI_AMMESSE.includes(origine) ? origine : ORIGINI_AMMESSE[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, x-client-info',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return Response.json({ ok: false }, { status: 405, headers: h });

  let body: unknown = null;
  try { body = await req.json(); } catch { /* resta null */ }
  const v = validaRichiesta(body);
  if (!v.ok) return Response.json({ ok: false }, { status: 400, headers: h });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: token, error } = await supabase.rpc('crea_token_account', { p_tipo: v.tipo, p_email: v.email });
  if (error) return Response.json({ ok: false }, { status: 500, headers: h });
  if (!token) return Response.json({ ok: true }, { headers: h });

  const { template_id, template_params } = parametriEmail(v.tipo, v.email, token as string);
  // Timeout e try/catch: un EmailJS lento o irraggiungibile deve dare un 502 con gli header
  // CORS (senza, il browser vedrebbe solo un errore di rete opaco), non un 500 nudo.
  try {
    const risposta = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: 'service_rk97p6m',
        template_id,
        user_id: 'KTIin1Rts7iSkzU96',
        accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY')!,
        template_params,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!risposta.ok) return Response.json({ ok: false }, { status: 502, headers: h });
  } catch {
    return Response.json({ ok: false }, { status: 502, headers: h });
  }
  return Response.json({ ok: true }, { headers: h });
});
