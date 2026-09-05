-- One display name per person, and a way for the sign-up and reset screens to
-- say which of the two things is wrong.
--
-- Supabase deliberately hides whether an email is registered: signUp on a
-- taken address returns a success with an empty identities array rather than
-- an error, and resetPasswordForEmail always reports success. That protects
-- against people harvesting which addresses have accounts. Telling a visitor
-- "that email already has an account, sign in instead" trades that protection
-- for a much clearer signup, which is the call made here — worth knowing it is
-- a trade rather than an oversight.

-- Names first, so the unique index below cannot fail halfway.
update public.profiles set display_name = trim(display_name)
 where display_name is distinct from trim(display_name);

with ranked as (
  select id,
         display_name,
         row_number() over (
           partition by lower(display_name) order by created_at, id) as rn
    from public.profiles
   where display_name is not null
)
update public.profiles p
   set display_name = r.display_name || '-' || r.rn
  from ranked r
 where p.id = r.id and r.rn > 1;

update public.profiles
   set display_name = split_part(email, '@', 1)
 where display_name is null or display_name = '';

alter table public.profiles
  alter column display_name set not null;

alter table public.profiles
  drop constraint if exists profiles_display_name_length;

alter table public.profiles
  add constraint profiles_display_name_length
  check (char_length(display_name) between 3 and 24);

-- Case-insensitive: "BeauBoone" and "beauboone" are the same person to
-- everyone reading a leaderboard, so they should not both exist.
create unique index if not exists profiles_display_name_unique
  on public.profiles (lower(display_name));

-- Signing up is a normal insert into auth.users, so this trigger is where a
-- duplicate name is caught. The screens check first and give a proper message;
-- reaching here means two people submitted the same name at once, and the
-- account must not be created under a name someone else holds.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1));

  if exists (select 1 from public.profiles where lower(display_name) = lower(v_name)) then
    raise exception 'That display name is already taken.' using errcode = 'unique_violation';
  end if;

  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, v_name)
  on conflict (id) do nothing;

  return new;
end $$;

-- Is this name free? Called before signing up, so it has to work for someone
-- with no session at all.
create or replace function public.username_available(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles
     where lower(display_name) = lower(trim(coalesce(p_name, ''))));
$$;

-- Does this address already have an account? Used to point a returning visitor
-- at sign-in instead of a signup that will not work, and to tell someone
-- asking for a reset link that there is nothing to reset.
create or replace function public.email_has_account(p_email text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users
     where lower(email) = lower(trim(coalesce(p_email, ''))));
$$;

revoke execute on function public.username_available(text)  from public;
revoke execute on function public.email_has_account(text)   from public;
grant  execute on function public.username_available(text)  to anon, authenticated;
grant  execute on function public.email_has_account(text)   to anon, authenticated;
