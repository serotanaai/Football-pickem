-- Check the typed name as well as the handle it becomes.
--
-- normalize_username strips anything outside [a-z0-9_-], which is exactly the
-- set the de-obfuscation table needs: a name spelled with dollar signs for
-- letter S loses them on the way to a handle and arrives looking innocent.
-- Both forms are compared now, so laundering a word through normalisation no
-- longer works. handle_new_user passes the raw metadata value for the same
-- reason, and takes the handle back out of the check rather than computing it
-- separately.
--
-- (Written with a $fn$ delimiter: the example this fixes contains the default
-- one, which would end the function body early.)

insert into public.blocked_username_terms (term, kind)
values ('ahole', 'profanity') on conflict (term) do nothing;

create or replace function public.username_problem(p_name text)
returns table (normalized text, problem text)
language plpgsql stable security definer
set search_path = public as $fn$
declare
  v_norm text;
  v_key  text;
  v_raw  text;
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
  v_raw := public.username_match_key(p_name);

  -- Longest first, so "assassin" is taken out before "ass" could match it.
  for r in
    select term from public.blocked_username_terms
     where kind = 'allow' order by char_length(term) desc
  loop
    v_key := replace(v_key, r.term, '');
    v_raw := replace(v_raw, r.term, '');
  end loop;

  if exists (
    select 1 from public.blocked_username_terms b
     where b.kind <> 'allow'
       and (strpos(v_key, b.term) > 0 or strpos(v_raw, b.term) > 0)
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
end $fn$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_raw     text;
  v_name    text;
  v_problem text;
begin
  v_raw := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                    split_part(new.email, '@', 1));

  select p.normalized, p.problem into v_name, v_problem
    from public.username_problem(v_raw) p;

  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'unique_violation';
  end if;

  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, v_name)
  on conflict (id) do nothing;

  return new;
end $fn$;
