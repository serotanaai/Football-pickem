-- Members' email addresses stop being readable by their league-mates.
--
-- The roster showed everyone's address to everyone, but the UI was never the
-- real exposure: "read profiles in shared leagues" grants SELECT on the whole
-- profiles row to anyone you share a league with, so any member could read
-- every league-mate's address straight off the REST API. Hiding the column in
-- the page would have left that untouched.
--
-- RLS is row-level and cannot help here, so the column privilege goes instead.
-- Nothing reachable by a signed-in user can select profiles.email now; the
-- roster comes back through a function that decides per row who may see it.
--
-- The SECURITY DEFINER functions that read profiles run as the owner and are
-- unaffected, and inserting an email on signup is a separate privilege from
-- selecting one, so account creation is untouched.

-- The table-level SELECT that Supabase grants by default covers every column,
-- so a column-level revoke has nothing to subtract from and silently does
-- nothing. The blanket grant has to go first, then the safe columns come back.
revoke select on public.profiles from anon, authenticated;
grant  select (id, display_name, avatar_url, created_at)
  on public.profiles to anon, authenticated;

/*
 * A league's roster, with addresses only where they are the reader's business.
 *
 * The commissioner needs them — they are the one chasing people who have not
 * picked — and everyone can see their own. Everybody else gets a null and the
 * page simply has nothing to render.
 */
create or replace function public.league_roster(p_league_id uuid)
returns table (
  user_id      uuid,
  display_name text,
  role         public.member_role,
  joined_at    timestamptz,
  email        text
)
language sql stable security definer
set search_path = public as $fn$
  select m.user_id,
         p.display_name,
         m.role,
         m.joined_at,
         case
           when public.is_league_commissioner(p_league_id) or m.user_id = auth.uid()
           then p.email
         end
    from public.league_members m
    join public.profiles p on p.id = m.user_id
   where m.league_id = p_league_id
     -- A roster is for the people in it.
     and public.is_league_member(p_league_id)
   order by m.joined_at;
$fn$;

revoke execute on function public.league_roster(uuid) from public, anon;
grant  execute on function public.league_roster(uuid) to authenticated;
