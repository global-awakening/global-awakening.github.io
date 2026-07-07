-- 15: statistiche telepatiche pubbliche di un utente, dalla fonte unica telepathy_scores.
-- Evita di dipendere da profiles.telepathy_score/best (storicamente desincronizzati).
-- Espone SOLO due contatori aggregati (nessuna PII), via SECURITY DEFINER.
create or replace function public.get_public_telepathy_stats(p_nickname text)
returns table(rounds_count int, matches_count int)
language sql
security definer
set search_path = public
as $$
  select coalesce(ts.rounds_count, 0)::int, coalesce(ts.matches_count, 0)::int
    from public.profiles p
    join public.telepathy_scores ts
      on ts.user_id = coalesce(p.email, p.session_id)
   where p.nickname = p_nickname
   limit 1;
$$;

grant execute on function public.get_public_telepathy_stats(text) to anon, authenticated;
