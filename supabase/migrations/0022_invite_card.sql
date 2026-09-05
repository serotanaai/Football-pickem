-- Just enough about a league to draw its invite card.
--
-- Link crawlers carry no session, so the card cannot use
-- league_preview_by_code, which is granted to signed-in users. The obvious
-- alternative — reading with the service role — would bypass RLS inside a
-- page render to fetch three public-ish fields, which is a lot of privilege
-- for a picture.
--
-- This returns only what the card prints: the name, the slate, and how many
-- people are in it. Naming a league to whoever already holds its invite code
-- gives nothing away, since the code is the secret and there are 31^8 of them.
create or replace function public.invite_card(p_code text)
returns table (name text, scope public.league_scope, conference_name text, member_count integer)
language sql stable security definer
set search_path = public as $fn$
  select l.name,
         l.scope,
         c.name,
         (select count(*)::int from public.league_members m where m.league_id = l.id)
    from public.leagues l
    left join public.conferences c on c.id = l.conference_id
   where upper(l.invite_code) = upper(trim(coalesce(p_code, '')));
$fn$;

revoke execute on function public.invite_card(text) from public;
grant  execute on function public.invite_card(text) to anon, authenticated;
