/**
 * Logica pura di send-account-email, separata da index.ts perché si possa provare con Node
 * (stessa scelta di notify-ritual-start/finestre.mjs).
 *
 * Il link non viene MAI dal chiamante: base fissa. È la differenza fra una funzione che manda
 * i nostri link e una che manda link di chiunque con il nostro nome.
 */
export const APP_URL = 'https://global-awakening.github.io/app.html';
export const ORIGINI_AMMESSE = ['https://global-awakening.github.io', 'http://localhost:4321'];

export function validaRichiesta(body) {
  if (!body || typeof body !== 'object') return { ok: false };
  const tipo = body.tipo;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (tipo !== 'reset' && tipo !== 'magic') return { ok: false };
  if (email.length === 0 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false };
  return { ok: true, tipo, email };
}

// Stessi template e stessi testi che l'app mandava dal browser fino al 28/09.
export function parametriEmail(tipo, email, token) {
  const t = encodeURIComponent(token);
  if (tipo === 'reset') {
    return { template_id: 'template_i5i06pl',
             template_params: { to_email: email, reset_url: `${APP_URL}?reset=${t}` } };
  }
  return {
    template_id: 'template_gy8gdkg',
    template_params: {
      to_email: email,
      subject: 'Your login link to Global Awakening',
      message: 'Click here to log in without a password.',
      magic_url: `${APP_URL}?magic=${t}`,
      cta_text: 'Login to Global Awakening',
      footer: 'This link expires in 15 minutes.',
    },
  };
}
