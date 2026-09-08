-- ---------------------------------------------------------------------------
-- Write down the agreement, not just the tick.
--
-- The signup form now requires two boxes before it will submit. A box is a
-- client-side fact and disappears the moment the page does, which makes it
-- worth exactly nothing later: the question that gets asked is never "did they
-- tick it", it is "what did they agree to, and when".
--
-- So the version travels with the signup, in raw_user_meta_data, and the
-- trigger that already builds the profile writes it down beside the account.
--
-- Deliberately not enforced here. A missing version is recorded as missing
-- rather than raised, because handle_new_user runs inside auth's own insert
-- and an exception there is a failed signup: the seed accounts, any future
-- OAuth provider, and an admin creating an account by hand would all start
-- failing for a reason nobody would connect to a checkbox. The gate belongs at
-- the form, which has it; this is the record.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version     text;

comment on column public.profiles.terms_accepted_at is
  'When this account accepted the agreements at signup. Null for accounts created before they existed.';
comment on column public.profiles.terms_version is
  'Which revision of the agreements was accepted — see LEGAL_VERSION in src/lib/legal.ts.';


create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_raw     text;
  v_name    text;
  v_problem text;
  v_terms   text;
begin
  -- The raw value goes to the check, not the tidied one, so obfuscation that
  -- normalising would launder is still seen.
  v_raw := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                    split_part(new.email, '@', 1));

  select p.normalized, p.problem into v_name, v_problem
    from public.username_problem(v_raw) p;

  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'unique_violation';
  end if;

  v_terms := nullif(trim(new.raw_user_meta_data ->> 'terms_version'), '');

  insert into public.profiles (id, email, display_name, terms_version, terms_accepted_at)
  values (new.id, new.email, v_name, v_terms,
          case when v_terms is not null then now() end)
  on conflict (id) do nothing;

  return new;
end $function$;
