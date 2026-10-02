-- Opt-ins belong to a browser control key; game accounts are not claimed or authenticated.
create table public.player_auto_sync_subscriptions (
  player_tag varchar(15) not null references public.players(player_tag) on delete cascade,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (player_tag, token_hash)
);
create index player_auto_sync_enabled on public.player_auto_sync_subscriptions(player_tag) where enabled;
create table public.player_auto_sync_queue (
  player_tag varchar(15) primary key references public.players(player_tag) on delete cascade,
  next_sync_at timestamptz not null default now(),
  interval_minutes integer not null default 5 check (interval_minutes between 5 and 30),
  idle_runs integer not null default 0,
  error_runs integer not null default 0,
  last_observed_at timestamptz,
  last_sync_at timestamptz,
  last_new_matches integer not null default 0,
  last_error text,
  gap_detected_at timestamptz,
  lease_token uuid,
  lease_until timestamptz
);
create index player_auto_sync_due on public.player_auto_sync_queue(next_sync_at);
alter table public.player_auto_sync_subscriptions enable row level security;
alter table public.player_auto_sync_queue enable row level security;
revoke all on public.player_auto_sync_subscriptions, public.player_auto_sync_queue from anon, authenticated;
grant all on public.player_auto_sync_subscriptions, public.player_auto_sync_queue to service_role;

create function public.set_player_auto_sync(p_tag text, p_token_hash text, p_enabled boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare was_active boolean;
begin
  -- Serialize registration capacity and setting changes, including multiple browsers.
  perform pg_advisory_xact_lock(806331002);
  if not exists(select 1 from public.players where player_tag = p_tag) then
    raise exception 'player_not_found';
  end if;
  if not p_enabled and not exists(select 1 from public.player_auto_sync_subscriptions where player_tag=p_tag and token_hash=p_token_hash) then
    return;
  end if;
  if p_enabled and not exists(select 1 from public.player_auto_sync_subscriptions where player_tag=p_tag and token_hash=p_token_hash) and
    (select count(*) from public.player_auto_sync_subscriptions where player_tag=p_tag and enabled) >= 10 then
    raise exception 'auto_sync_capacity';
  end if;
  select exists(select 1 from public.player_auto_sync_subscriptions where player_tag=p_tag and enabled) into was_active;
  if p_enabled and not was_active and
      (select count(distinct player_tag) from public.player_auto_sync_subscriptions where enabled) >= 100 then
    raise exception 'auto_sync_capacity';
  end if;
  insert into public.player_auto_sync_queue(player_tag) values(p_tag) on conflict do nothing;
  perform 1 from public.player_auto_sync_queue where player_tag=p_tag for update;
  insert into public.player_auto_sync_subscriptions(player_tag,token_hash,enabled)
    values(p_tag,p_token_hash,p_enabled)
    on conflict(player_tag,token_hash) do update set enabled=excluded.enabled, updated_at=now();
  if p_enabled and not was_active then
    update public.player_auto_sync_queue set next_sync_at=now(), interval_minutes=5,
      idle_runs=0, error_runs=0, last_error=null, lease_token=null, lease_until=null where player_tag=p_tag;
  elsif not exists(select 1 from public.player_auto_sync_subscriptions where player_tag=p_tag and enabled) then
    update public.player_auto_sync_queue set lease_token=null, lease_until=null where player_tag=p_tag;
  end if;
end;
$$;

create function public.claim_player_auto_sync(p_limit integer default 50)
returns setof public.player_auto_sync_queue language sql security invoker set search_path = '' as $$
  with due as (
    select q.player_tag from public.player_auto_sync_queue q
    where q.next_sync_at <= now() and (q.lease_until is null or q.lease_until < now())
      and exists(select 1 from public.player_auto_sync_subscriptions s where s.player_tag=q.player_tag and s.enabled)
    order by q.next_sync_at, q.player_tag limit greatest(1,least(p_limit,50))
    for update of q skip locked
  )
  update public.player_auto_sync_queue q set lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes'
    from due where q.player_tag=due.player_tag returning q.*;
$$;

create function public.finish_player_auto_sync(p_tag text, p_lease uuid, p_records jsonb, p_state jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.player_auto_sync_queue where player_tag=p_tag and lease_token=p_lease for update;
  if not found or not exists(select 1 from public.player_auto_sync_subscriptions where player_tag=p_tag and enabled) then
    return false;
  end if;
  insert into public.match_raw_history(match_id,battle_uid,player_tag,match_at,match_type,mode,map_id,result,hero_used,allies,opponents)
    select r.match_id,r.battle_uid,p_tag,r.match_at,r.match_type,r.mode,r.map_id,r.result,r.hero_used,r.allies,r.opponents
    from jsonb_to_recordset(p_records) as r(match_id text,battle_uid text,match_at timestamp,match_type text,
        mode text,map_id text,result text,hero_used text,allies text[],opponents text[])
    where r.match_at >= now()-interval '60 days' and r.match_at <= now()
    on conflict (match_id) do nothing;
  update public.player_auto_sync_queue set
    next_sync_at=(p_state->>'next_sync_at')::timestamptz,
    interval_minutes=(p_state->>'interval_minutes')::integer,
    idle_runs=coalesce((p_state->>'idle_runs')::integer,idle_runs),
    error_runs=(p_state->>'error_runs')::integer,
    last_sync_at=coalesce((p_state->>'last_sync_at')::timestamptz,last_sync_at),
    last_observed_at=coalesce((p_state->>'last_observed_at')::timestamptz,last_observed_at),
    last_new_matches=coalesce((p_state->>'last_new_matches')::integer,last_new_matches),
    gap_detected_at=coalesce((p_state->>'gap_detected_at')::timestamptz,gap_detected_at),
    last_error=p_state->>'last_error',lease_token=null,lease_until=null
    where player_tag=p_tag;
  return true;
end;
$$;
revoke all on function public.set_player_auto_sync(text,text,boolean),
  public.claim_player_auto_sync(integer), public.finish_player_auto_sync(text,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.set_player_auto_sync(text,text,boolean),
  public.claim_player_auto_sync(integer), public.finish_player_auto_sync(text,uuid,jsonb,jsonb) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;
-- URL and authentication key are configured separately in Vault, never in Git.
create function public.dispatch_player_auto_sync()
returns bigint language plpgsql security invoker set search_path = '' as $$
declare endpoint text; secret text;
begin
  if not exists(select 1 from public.player_auto_sync_queue q
    where q.next_sync_at<=now() and (q.lease_until is null or q.lease_until<now())
      and exists(select 1 from public.player_auto_sync_subscriptions s where s.player_tag=q.player_tag and s.enabled)) then
    return null;
  end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='brawl_auto_sync_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='brawl_auto_sync_secret';
  if endpoint is null or secret is null then return null; end if;
  return net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','auto-sync-secret',secret),
    body:='{}'::jsonb,timeout_milliseconds:=90000);
end;
$$;
revoke all on function public.dispatch_player_auto_sync() from public, anon, authenticated, service_role;
select cron.schedule('brawl-player-auto-sync','* * * * *','select public.dispatch_player_auto_sync();');
