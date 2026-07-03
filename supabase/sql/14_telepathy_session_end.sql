-- 14: fine sessione telepatia come stato condiviso su DB.
-- Prima d'ora ogni client deduceva la fine dal polling (match cancellato / last_seen stale),
-- causando desync (uno vede "ended", l'altro resta bloccato). Ora la fine è un flag esplicito.

alter table public.telepathy_matches
  add column if not exists ended_at timestamptz,
  add column if not exists ended_by text;

-- NB: ended_by contiene il session token del client (sessionId lato app), MAI l'email
-- dell'utente autenticato: la tabella e' letta senza filtri durante il matchmaking
-- (world-readable di fatto), quindi nessun dato personale va scritto qui. Il valore
-- serve solo per un confronto di uguaglianza lato client, non viene mai renderizzato.

-- RPC trustful (pattern del progetto): chiunque conosca il match_id puo' marcarlo terminato.
-- Non cancella il record subito: lascia che l'altro lato lo rilevi via polling prima del cleanup.
create or replace function public.end_telepathy_match(p_match_id uuid, p_ended_by text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.telepathy_matches
     set ended_at = coalesce(ended_at, now()),
         ended_by = coalesce(ended_by, p_ended_by)
   where id = p_match_id;
$$;

grant execute on function public.end_telepathy_match(uuid, text) to anon, authenticated;
