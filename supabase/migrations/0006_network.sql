-- Connections between members, and the notifications that tell members about
-- activity that involves them.
--
-- Connections are mutual, LinkedIn-style: one member invites, the other accepts
-- or ignores. One row per pair, whoever asked first.
--
-- Notifications are written by the triggers below, never by the client, so
-- every path (the app, scripts, seed data) produces the same ones. Members read
-- and mark their own; realtime streams new rows to the recipient.

create table connections (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references users(id) on delete cascade,
  addressee_id  uuid not null references users(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'ignored')),
  message       text check (char_length(message) <= 300),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  check (requester_id <> addressee_id)
);

-- One row per pair, in either direction.
create unique index connections_pair on connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index on connections (addressee_id, status);
create index on connections (requester_id, status);

alter table connections enable row level security;

create policy "members read their own connections" on connections
  for select to authenticated using (auth.uid() in (requester_id, addressee_id) or public.is_admin());
create policy "members invite as themselves" on connections
  for insert to authenticated with check (requester_id = auth.uid() and status = 'pending');
create policy "addressees answer invitations" on connections
  for update to authenticated using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
create policy "either side removes a connection" on connections
  for delete to authenticated using (auth.uid() in (requester_id, addressee_id));

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  actor_id    uuid references users(id) on delete cascade,
  type        text not null check (type in (
                'post_like', 'post_comment', 'mention', 'repost',
                'connection_request', 'connection_accepted',
                'request_received', 'request_responded',
                'endorsement', 'profile_view')),
  post_id     uuid references posts(id) on delete cascade,
  comment_id  uuid references post_comments(id) on delete cascade,
  data        jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index on notifications (user_id, created_at desc);
create index notifications_unread on notifications (user_id) where read_at is null;

alter table notifications enable row level security;

create policy "members read their notifications" on notifications
  for select to authenticated using (user_id = auth.uid());
create policy "members mark their notifications read" on notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members clear their notifications" on notifications
  for delete to authenticated using (user_id = auth.uid());

-- Realtime pushes new notifications to the recipient's open pages.
alter publication supabase_realtime add table notifications;

/* ------------------------------------------------------------------ */
/* Triggers that write notifications                                   */
/* ------------------------------------------------------------------ */

-- Security definer: they write rows the acting member may not insert directly.

create or replace function public.notify_post_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare author uuid;
begin
  if tg_op = 'INSERT' then
    select author_id into author from posts where id = new.post_id;
    if author is not null and author <> new.user_id then
      insert into notifications (user_id, actor_id, type, post_id)
      values (author, new.user_id, 'post_like', new.post_id);
    end if;
    return new;
  end if;
  -- An unlike takes its notification back, if it has not been read yet.
  delete from notifications
   where type = 'post_like' and post_id = old.post_id and actor_id = old.user_id and read_at is null;
  return old;
end $$;

create trigger post_likes_notify after insert or delete on post_likes
  for each row execute function public.notify_post_like();

create or replace function public.notify_post_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare author uuid;
begin
  select author_id into author from posts where id = new.post_id;
  if author is not null and author <> new.author_id then
    insert into notifications (user_id, actor_id, type, post_id, comment_id, data)
    values (author, new.author_id, 'post_comment', new.post_id, new.id, jsonb_build_object('excerpt', left(new.body, 120)));
  end if;
  return new;
end $$;

create trigger post_comments_notify after insert on post_comments
  for each row execute function public.notify_post_comment();

create or replace function public.notify_connection() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications (user_id, actor_id, type, data)
    values (new.addressee_id, new.requester_id, 'connection_request', jsonb_build_object('connection_id', new.id));
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.status = 'accepted' and old.status <> 'accepted' then
      insert into notifications (user_id, actor_id, type, data)
      values (new.requester_id, new.addressee_id, 'connection_accepted', jsonb_build_object('connection_id', new.id));
    end if;
    -- Once answered, the invitation notification has done its job.
    if new.status <> 'pending' then
      update notifications set read_at = coalesce(read_at, now())
       where type = 'connection_request' and data->>'connection_id' = new.id::text;
    end if;
    return new;
  end if;
  delete from notifications where data->>'connection_id' = old.id::text;
  return old;
end $$;

create trigger connections_notify after insert or update or delete on connections
  for each row execute function public.notify_connection();

create or replace function public.notify_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications (user_id, actor_id, type, data)
    values (new.alumni_id, new.student_id, 'request_received', jsonb_build_object('request_id', new.id, 'request_type', new.type));
  elsif new.status is distinct from old.status and new.status in ('accepted', 'declined') then
    insert into notifications (user_id, actor_id, type, data)
    values (new.student_id, new.alumni_id, 'request_responded',
            jsonb_build_object('request_id', new.id, 'request_type', new.type, 'status', new.status));
  end if;
  return new;
end $$;

create trigger requests_notify after insert or update of status on requests
  for each row execute function public.notify_request();

revoke all on function public.notify_post_like() from public;
revoke all on function public.notify_post_comment() from public;
revoke all on function public.notify_connection() from public;
revoke all on function public.notify_request() from public;
