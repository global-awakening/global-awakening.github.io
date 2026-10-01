/**
 * decisioni.mjs — cosa fa notify-telepathy-invite, senza rete e senza database.
 *
 * La funzione è invocabile da chiunque abbia la chiave pubblica (come alert-cron): per questo
 * NON si fida del chiamante. Rilegge l'invito e manda una push solo se lo stato la giustifica.
 * Chi la chiama a caso ottiene al massimo un controllo in più, mai una notifica non dovuta.
 *
 * TTL e urgenza (spec §4.2): una notifica d'invito consegnata dopo la scadenza è solo rumore,
 * quindi il suo TTL è il tempo che resta; «accettato» vale quanto l'attesa massima di chi ha
 * accettato (3 minuti); rifiutato e scaduto possono arrivare con calma.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPI_DA_FUORI = ['invito', 'accettato', 'rifiutato'];

export function leggiRichiesta(corpo) {
  if (!corpo || typeof corpo !== 'object') return null;
  if (corpo.tipo === 'scadenze') return { tipo: 'scadenze' };
  if (TIPI_DA_FUORI.includes(corpo.tipo) && typeof corpo.invito === 'string' && UUID.test(corpo.invito)) {
    return { tipo: corpo.tipo, invito: corpo.invito.toLowerCase() };
  }
  return null;
}

/** Stessa regola di telepatia_era_da_dieci nella 32a: un invito da 45 s dura 45 s, uno da 10 minuti 600. */
export function eraDaDieciMinuti(inv) {
  return Date.parse(inv.expires_at) - Date.parse(inv.created_at) > 60000;
}

/**
 * destinatarioDisponibile: il destinatario ha oggi una riga di disponibilità (spec §7). Lo
 * rilegge index.ts dal database. Conta solo per la push d'invito, che è l'unica diretta al
 * destinatario: se ha spento l'interruttore l'invito resta valido ma non deve suonargli sul
 * telefono. Se non è indicato (undefined) vale «no»: nel dubbio non si disturba nessuno.
 * Le push al mittente (accettato, rifiutato, scaduto) non ne dipendono.
 */
export function decidiPush(tipo, inv, adessoMs, destinatarioDisponibile) {
  if (!inv) return null;
  if (tipo === 'invito') {
    if (inv.status !== 'pending' || inv.con_push !== true) return null;
    if (destinatarioDisponibile !== true) return null;
    const restano = Date.parse(inv.expires_at) - adessoMs;
    if (!(restano > 0)) return null;
    return { a: 'destinatario', kind: 'invito', nome: inv.from_name, ttl: Math.max(1, Math.floor(restano / 1000)), urgency: 'high' };
  }
  if (tipo === 'accettato') {
    if (inv.status !== 'accepted' || !inv.match_id) return null;
    return { a: 'mittente', kind: 'accettato', nome: inv.to_name, ttl: 180, urgency: 'high' };
  }
  if (tipo === 'rifiutato') {
    if (inv.status !== 'declined' || !eraDaDieciMinuti(inv)) return null;
    return { a: 'mittente', kind: 'rifiutato', nome: inv.to_name, ttl: 3600, urgency: 'normal' };
  }
  if (tipo === 'scaduto') {
    if (inv.status !== 'expired' || !eraDaDieciMinuti(inv)) return null;
    return { a: 'mittente', kind: 'scaduto', nome: inv.to_name, ttl: 3600, urgency: 'normal' };
  }
  return null;
}
