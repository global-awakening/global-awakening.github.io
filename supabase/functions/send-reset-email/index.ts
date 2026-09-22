// Versione FISSATA, e npm: invece di esm.sh. Senza versione si prendeva l'ultima, e il
// 22/09/2026 l'ultima aveva una dipendenza che il bundler di Supabase non riusciva a
// risolvere: nessuna funzione era piu' pubblicabile, senza che nessuno avesse toccato niente.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, appUrl } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verifica che l'email esista in profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname, email')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (!profile) {
      // Risponde sempre OK per non rivelare quali email sono registrate
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Genera token e scadenza (1 ora)
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Cancella eventuali token precedenti per questa email
    await supabase.from('password_resets').delete().eq('email', email.toLowerCase().trim());

    // Salva il token
    await supabase.from('password_resets').insert({
      email: email.toLowerCase().trim(),
      token,
      expires_at: expiresAt,
    });

    // Costruisce il link di reset
    const base = appUrl || 'https://global-awakening.github.io/app.html';
    const resetLink = `${base}?reset=${token}`;

    // Manda la mail via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY non configurata');

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Global Awakening <onboarding@resend.dev>',
        to: email,
        subject: '🔮 Reset della tua password — Global Awakening',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f1123;color:#e5e7eb;padding:2rem;border-radius:1rem;">
            <div style="text-align:center;margin-bottom:1.5rem;">
              <div style="font-size:3rem;">⭐</div>
              <h1 style="color:#a78bfa;margin:0.5rem 0;">Global Awakening</h1>
            </div>
            <p>Ciao <strong>${profile.nickname}</strong>,</p>
            <p>Hai richiesto il reset della password. Clicca il bottone qui sotto per impostarne una nuova:</p>
            <div style="text-align:center;margin:2rem 0;">
              <a href="${resetLink}"
                 style="background:#7c3aed;color:#fff;padding:0.875rem 2rem;border-radius:0.75rem;text-decoration:none;font-weight:bold;font-size:1rem;">
                Reimposta Password
              </a>
            </div>
            <p style="color:#9ca3af;font-size:0.875rem;">Il link scade tra <strong>1 ora</strong>. Se non hai richiesto il reset, ignora questa email.</p>
            <hr style="border-color:#374151;margin:1.5rem 0;">
            <p style="color:#6b7280;font-size:0.75rem;text-align:center;">Global Awakening Platform ✨</p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      throw new Error(`Resend error ${emailRes.status}: ${errBody}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-reset-email error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
