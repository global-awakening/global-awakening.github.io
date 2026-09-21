/**
 * alert-cron — avvisa per email quando qualcosa smette di girare.
 *
 * Perché esiste: il difetto che ha reso possibile il cron fantasma non è stato il carattere
 * sbagliato, è che nessuno si accorgeva dei fallimenti. Un cron rotto ha girato a vuoto
 * 33.615 volte fra aprile e settembre 2026 senza che nessuno lo sapesse.
 *
 * Perché è una Edge Function e non SQL dentro il cron: la chiave privata di EmailJS vive qui,
 * fra i segreti della funzione, e non nel database. Il comando di un job pg_cron è leggibile
 * da chiunque abbia accesso al database, quindi una credenziale scritta lì sarebbe esposta a
 * tutti quelli che possono leggere `cron.job`.
 *
 * Perché è sicura pur essendo invocabile da chiunque abbia la chiave pubblica: NON accetta
 * nessun contenuto da chi la chiama. Interroga lei il database, decide lei se c'è un guasto, e
 * manda l'email solo nel momento in cui il guasto COMINCIA. Chi la invocasse a caso otterrebbe
 * soltanto un controllo in più, non un'email.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // La RPC fa il conteggio, registra la finestra nello storico e dice se questo è il momento
  // in cui il guasto comincia. Tutta la logica sta lì perché deve leggere gli schemi `cron` e
  // `net`, che PostgREST non espone.
  const { data, error } = await supabase.rpc('controlla_salute_cron');

  if (error) {
    return Response.json({ errore: 'controllo non riuscito: ' + error.message }, { status: 500 });
  }

  const esito = (data ?? {}) as { job_falliti?: number; risposte_non_ok?: number; avvisato?: boolean };

  if (!esito.avvisato) {
    return Response.json({ ...esito, email: false });
  }

  const risposta = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: 'service_rk97p6m',
      template_id: 'template_gy8gdkg',
      user_id: 'KTIin1Rts7iSkzU96',
      accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY')!,
      template_params: {
        to_email: 'global.awakening.app@gmail.com',
        subject: 'Global Awakening — qualcosa non gira',
        message: `Negli ultimi 20 minuti: ${esito.job_falliti ?? 0} esecuzioni di cron fallite, `
               + `${esito.risposte_non_ok ?? 0} risposte HTTP non riuscite. `
               + 'Le notifiche di avvio rituale potrebbero non partire.',
        magic_url: 'https://supabase.com/dashboard/project/vxzxdkcluyrcftsnxxza',
        cta_text: 'Apri il progetto',
        footer: 'Controllo automatico dei job pg_cron, ogni 15 minuti.'
      }
    })
  });

  return Response.json({ ...esito, email: true, emailjs: risposta.status });
});
