-- ============================================================================
-- 37a_profilo_mio.sql — chiave dei profili, parte additiva (1 di 2).
-- Scopo: profiles.session_id è leggibile con la chiave pubblica (GRANT di colonna della 27_),
-- e per un iscritto il session_id vale ancora come credenziale in alcune RPC (join_ritual,
-- segna_presenza_rituale). L'app lo legge solo per caricare il PROPRIO profilo: qui nasce una
-- funzione che lo restituisce senza session_id, così la 37b può togliere la colonna ad anon.
-- Compatibile con l'app vecchia: non toglie niente. Idempotente. Ritorno: 37a_ritorno.sql.
-- ============================================================================
BEGIN;

-- Le colonne pubbliche del profilo legato a questo session_id (null se non c'è). Il session_id
-- non esce: chi chiama lo conosce già. I dati sono gli stessi che chiunque legge per nickname.
CREATE OR REPLACE FUNCTION public.mio_profilo(p_session_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
           'nickname', p.nickname, 'bio', p.bio, 'starseed_type', p.starseed_type, 'avatar', p.avatar,
           'country', p.country, 'interests', p.interests, 'experience_level', p.experience_level,
           'telepathy_score', p.telepathy_score, 'telepathy_best', p.telepathy_best,
           'show_telepathy_score', p.show_telepathy_score)
    FROM profiles p
   WHERE p_session_id IS NOT NULL AND p.session_id = p_session_id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.mio_profilo(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mio_profilo(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
