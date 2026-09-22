import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// Versione FISSATA, e npm: invece di esm.sh. Senza versione si prendeva l'ultima, e il
// 22/09/2026 l'ultima aveva una dipendenza che il bundler di Supabase non riusciva a
// risolvere: nessuna funzione era piu' pubblicabile, senza che nessuno avesse toccato niente.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { email, appUrl } = await req.json();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Genera token univoco
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minuti

  // Cancella token precedenti per la stessa email
  await supabase.from('magic_links').delete().eq('email', email);

  // Salva token
  await supabase.from('magic_links').insert({ email, token, expires_at: expiresAt });

  const magicUrl = `${appUrl}?magic=${token}`;

  // Invia email via Resend
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Global Awakening <noreply@globalawakening.app>',
      to: [email],
      subject: '✨ Il tuo link di accesso a Global Awakening',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #0f0c1a; color: #fff; padding: 2rem; border-radius: 1rem;">
          <h1 style="color: #a78bfa; text-align: center; font-size: 1.5rem;">⭐ Global Awakening</h1>
          <p style="text-align: center; color: #c4b5fd; margin: 1rem 0;">Clicca il pulsante per accedere istantaneamente, senza password.</p>
          <div style="text-align: center; margin: 2rem 0;">
            <a href="${magicUrl}" style="background: #7c3aed; color: #fff; padding: 0.75rem 2rem; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 1rem;">
              Accedi ora
            </a>
          </div>
          <p style="text-align: center; color: rgba(255,255,255,0.4); font-size: 0.8rem;">Il link scade tra 15 minuti. Se non hai richiesto l'accesso, ignora questa email.</p>
        </div>
      `,
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
