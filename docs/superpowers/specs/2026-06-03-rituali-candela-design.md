# Candela per i rituali (Batch D #10) · Design

Data: 2026-06-03
Stato: approvato

## Obiettivo

Aggiungere un gesto simbolico "accendi una candela" ai rituali: ogni utente può
accendere/spegnere una candela per un rituale (in qualsiasi momento, anche prima che
sia *live*), come segno di intenzione/sostegno. La card mostra il numero di candele
accese. Complementa l'energia (⚡, disponibile solo durante il *live*) con un gesto
contemplativo persistente.

## Contesto

- Card rituale (`app.html` ~3502-3556): header (icona tipo, nome, descrizione,
  creator ✦, sacred_number), data/ora UTC, partecipanti + status, riga bottoni
  Join/Joined + (solo se *live*) `⚡ {energy}`.
- Meccaniche esistenti: `participants` è un **array jsonb di `session_id`**
  (`join_ritual` fa append idempotente); `energy` è un int (`send_ritual_energy`
  incrementa). Entrambe le RPC sono `SECURITY DEFINER`, usano `session_id` opaco,
  niente hash ("trustful", Step A).
- `sessionId` e `passwordHash` disponibili nel componente; guest e registrati hanno
  entrambi un `sessionId`.

## Modello dati

Nuova colonna `rituals.candles jsonb NOT NULL DEFAULT '[]'::jsonb` = array dei
`session_id` che hanno acceso una candela. Riusa esattamente il pattern di
`participants` (nessuna nuova tabella).
- **count candele** = `jsonb_array_length(candles)`.
- **accesa dall'utente** = `candles @> to_jsonb(array[session_id])`.

## Componenti

### 1. DB — `supabase/sql/09_ritual_candles.sql` (additivo, non-breaking, idempotente)

```sql
ALTER TABLE rituals ADD COLUMN IF NOT EXISTS candles jsonb NOT NULL DEFAULT '[]'::jsonb;
```

RPC `toggle_ritual_candle(p_ritual_id bigint, p_session_id text) RETURNS SETOF rituals`,
`SECURITY DEFINER SET search_path = public`:
- guard: `p_session_id` non vuoto, rituale esistente;
- se `candles @> [p_session_id]` → rimuovi (`candles - p_session_id` via jsonb minus su
  elemento, oppure ricostruzione con filtro); altrimenti append
  (`candles || to_jsonb(p_session_id)`);
- `RETURNING *` per dare al client la riga aggiornata.
- `GRANT EXECUTE … TO anon`.

Nota tecnica: per rimuovere un elemento da un array jsonb si usa
`(SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e WHERE e <> to_jsonb(p_session_id))`
con fallback `'[]'` se diventa vuoto.

### 2. Client (`app.html`)

- `toggleCandle(ritualId)`: chiama `toggle_ritual_candle` con `sessionId`; su successo
  aggiorna `rituals` state con la riga ritornata (ottimistico/refresh); su errore
  `showErrorToast()`.
- Card: nuovo bottone 🕯️ **sempre visibile** nella riga bottoni (accanto a Join), con
  `🕯️ {ritual.candles?.length || 0}`. Stato acceso (`ritual.candles?.includes(sessionId)`)
  → evidenziato (sfondo ambrato `rgba(251,191,36,…)`, fiamma piena); spento → neutro.
  `aria-label` da i18n.
- i18n `t.rituals.candleLight` ("Light a candle"/"Accendi una candela"),
  `candleExtinguish` ("Extinguish"/"Spegni") per aria-label/title.
- `createRitual` ottimistico (`setRituals(prev => [data[0], ...])`): `data[0]` includerà
  già `candles: []` dalla RPC `create_ritual` (la colonna ha DEFAULT) → nessun undefined;
  il client usa comunque `ritual.candles?.length || 0` per robustezza su righe vecchie.

### 3. GDPR

`candles` contiene `session_id` opachi (come `participants`) → non PII identificabile.
Nessuna modifica a `delete_my_account`/`export_my_account` (coerente con la scelta già
presa per `participants`).

## Error handling

- RPC error / dati vuoti → `showErrorToast()`, nessun cambiamento di stato.
- Doppio click rapido → toggle idempotente lato DB (l'array non duplica/non va negativo).

## Testing

`test-rituali-candele.js` (REST/RPC anon, pattern esistente):
1. Crea un rituale (RPC `create_ritual`, date scadute per auto-cleanup).
2. `toggle_ritual_candle(id, SID)` → `candles` contiene SID, length 1 (accesa).
3. `toggle_ritual_candle(id, SID)` di nuovo → `candles` non contiene SID, length 0 (spenta).
4. Due session_id diversi → length 2; toggle di uno → length 1 (indipendenza).
5. Cleanup via `cleanup_expired_rituals`.

Non-regressione: `test-rituali.js` 18/18 (la card ora ha il bottone candela; i test
esistenti non lo usano ma non devono rompersi).

## Out of scope (YAGNI)

- Dedica testuale sulla candela (era l'opzione B, scartata: vicina ai commenti).
- Animazione fiamma elaborata (basta evidenziazione stato + emoji 🕯️).
- Notifica al creatore quando qualcuno accende (l'energia non la manda, restiamo coerenti).
- Limite/anti-spam sul toggle (trustful come join/energy; session_id opaco).
