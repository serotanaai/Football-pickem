-- Display names become handles: lower case, spaces as underscores, 20 at most,
-- and not a slur.
--
-- The blocked words live in a table rather than in the application, because
-- the browser is not where this can be enforced — signing up is an insert into
-- auth.users, so the trigger is the only place that sees every attempt. One
-- list, read by both the live check the form makes and the trigger that has
-- the final say, and extendable with an INSERT rather than a deploy.

create or replace function public.normalize_username(p_name text)
returns text
language sql immutable
set search_path = pg_catalog, public as $$
  select left(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(p_name, ''))), '\s+', '_', 'g'),
      '[^a-z0-9_-]', '', 'g'),
    20);
$$;

/*
 * The form a name is compared in, not the form it is stored in.
 *
 * Separators come out and the usual letter-for-digit swaps go back, so
 * "b_a_d.w0rd" and "badword" are the same string to the check below. Digits
 * that are not stand-ins are dropped rather than kept, since a trailing 27 is
 * not what makes a name acceptable.
 */
create or replace function public.username_match_key(p_name text)
returns text
language sql immutable
set search_path = pg_catalog, public as $$
  select regexp_replace(
    translate(lower(coalesce(p_name, '')), '0134578@$!|', 'oieastbasil'),
    '[^a-z]', '', 'g');
$$;

create table if not exists public.blocked_username_terms (
  term       text primary key,
  kind       text not null default 'profanity'
             check (kind in ('slur', 'profanity', 'allow')),
  created_at timestamptz not null default now()
);

-- Nobody reads this through the API. The list is only ever consulted by the
-- SECURITY DEFINER functions below, which return a yes or no rather than the
-- contents — publishing a blocklist is publishing a list of things to try.
alter table public.blocked_username_terms enable row level security;

insert into public.blocked_username_terms (term, kind) values
  -- Slurs. Substring matches, because there is no innocent name around them.
  ('nigg', 'slur'), ('negro', 'slur'), ('faggot', 'slur'), ('fagg', 'slur'),
  ('chink', 'slur'), ('spic', 'slur'), ('kike', 'slur'), ('wetback', 'slur'),
  ('gook', 'slur'), ('beaner', 'slur'), ('towelhead', 'slur'), ('paki', 'slur'),
  ('tranny', 'slur'), ('shemale', 'slur'), ('dyke', 'slur'), ('coon', 'slur'),
  ('retard', 'slur'), ('nazi', 'slur'), ('hitler', 'slur'), ('rapist', 'slur'),
  -- Profanity.
  ('fuck', 'profanity'), ('shit', 'profanity'), ('cunt', 'profanity'),
  ('bitch', 'profanity'), ('bastard', 'profanity'), ('asshole', 'profanity'),
  ('dick', 'profanity'), ('cock', 'profanity'), ('pussy', 'profanity'),
  ('whore', 'profanity'), ('slut', 'profanity'), ('twat', 'profanity'),
  ('wank', 'profanity'), ('bollock', 'profanity'), ('prick', 'profanity'),
  ('piss', 'profanity'), ('jizz', 'profanity'), ('boner', 'profanity'),
  ('rape', 'profanity'), ('ass', 'profanity'), ('tits', 'profanity'),
  ('cum', 'profanity'), ('penis', 'profanity'), ('vagina', 'profanity'),
  -- Innocent words that contain one of the above. Without these, half of
  -- Scunthorpe cannot sign up: these are cut out of the name before the check
  -- runs, so "bassman" is a bass man and "bigass" is still caught.
  ('assassin', 'allow'), ('ambassador', 'allow'), ('associate', 'allow'),
  ('assist', 'allow'), ('assess', 'allow'), ('asset', 'allow'),
  ('assume', 'allow'), ('assign', 'allow'), ('compass', 'allow'),
  ('embassy', 'allow'), ('molasses', 'allow'), ('potassium', 'allow'),
  ('canvass', 'allow'), ('harass', 'allow'), ('bass', 'allow'),
  ('class', 'allow'), ('glass', 'allow'), ('grass', 'allow'), ('brass', 'allow'),
  ('pass', 'allow'), ('mass', 'allow'), ('lass', 'allow'),
  ('cocktail', 'allow'), ('cockpit', 'allow'), ('peacock', 'allow'),
  ('hancock', 'allow'), ('shuttlecock', 'allow'), ('cocker', 'allow'),
  ('dickinson', 'allow'), ('dickens', 'allow'), ('dickerson', 'allow'),
  ('shiitake', 'allow'), ('scunthorpe', 'allow'), ('penistone', 'allow'),
  ('analysis', 'allow'), ('analyst', 'allow'), ('analog', 'allow'),
  ('canal', 'allow'), ('banal', 'allow'),
  ('titan', 'allow'), ('title', 'allow'), ('competitive', 'allow'),
  ('appetite', 'allow'), ('circumstance', 'allow'), ('cucumber', 'allow'),
  ('accumulate', 'allow'), ('cumberland', 'allow'), ('document', 'allow'),
  ('spice', 'allow'), ('spicy', 'allow'), ('suspicious', 'allow'),
  ('auspicious', 'allow'), ('conspicuous', 'allow'),
  ('raccoon', 'allow'), ('cocoon', 'allow'), ('tycoon', 'allow'),
  ('pakistan', 'allow'), ('negroni', 'allow'), ('retardant', 'allow'),
  ('vandyke', 'allow'), ('grape', 'allow'), ('drape', 'allow'),
  ('therapist', 'allow'), ('scrape', 'allow')
on conflict (term) do nothing;

/*
 * Everything wrong with a proposed name, and what it would become.
 *
 * Returns the normalised handle alongside the first problem, so the form can
 * show the person exactly what they are about to get as well as why they
 * cannot have it.
 */
create or replace function public.username_problem(p_name text)
returns table (normalized text, problem text)
language plpgsql stable security definer
set search_path = public as $$
declare
  v_norm text;
  v_key  text;
  r      record;
begin
  v_norm := public.normalize_username(p_name);
  normalized := v_norm;

  if char_length(v_norm) < 3 then
    problem := 'Display names need at least 3 characters.';
    return next; return;
  end if;

  if v_norm !~ '[a-z0-9]' then
    problem := 'Display names need at least one letter or number.';
    return next; return;
  end if;

  v_key := public.username_match_key(v_norm);

  -- Longest first, so "assassin" is taken out before "ass" could match it.
  for r in
    select term from public.blocked_username_terms
     where kind = 'allow' order by char_length(term) desc
  loop
    v_key := replace(v_key, r.term, '');
  end loop;

  if exists (
    select 1 from public.blocked_username_terms b
     where b.kind <> 'allow' and strpos(v_key, b.term) > 0
  ) then
    problem := 'That display name is not available. Please choose another.';
    return next; return;
  end if;

  if exists (select 1 from public.profiles where display_name = v_norm) then
    problem := format('"%s" is already taken.', v_norm);
    return next; return;
  end if;

  problem := null;
  return next;
end $$;

revoke execute on function public.username_problem(text) from public;
grant  execute on function public.username_problem(text) to anon, authenticated;
grant  execute on function public.normalize_username(text) to anon, authenticated;

-- Existing names become handles. Lowercasing cannot create a collision, since
-- the unique index was already on lower(display_name), but replacing spaces
-- and dropping punctuation can, so anything that lands on a taken handle gets
-- a suffix.
update public.profiles set display_name = public.normalize_username(display_name)
 where display_name is distinct from public.normalize_username(display_name);

with ranked as (
  select id, display_name,
         row_number() over (partition by display_name order by created_at, id) as rn
    from public.profiles
)
update public.profiles p
   set display_name = left(r.display_name, 18) || '_' || r.rn
  from ranked r
 where p.id = r.id and r.rn > 1;

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length
  check (char_length(display_name) between 3 and 20);

-- Signing up is an insert into auth.users, so this is the only place that sees
-- every attempt, whatever the form did or did not check.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name    text;
  v_problem text;
begin
  v_name := public.normalize_username(
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
             split_part(new.email, '@', 1)));

  select p.problem into v_problem from public.username_problem(v_name) p;
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'unique_violation';
  end if;

  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, v_name)
  on conflict (id) do nothing;

  return new;
end $$;
