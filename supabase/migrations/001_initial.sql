begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (char_length(display_name) between 1 and 80)
);
create table public.trips (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 name text not null check (char_length(name) between 1 and 120),
 destination text not null check (char_length(destination) between 1 and 160),
 start_date date not null, end_date date not null check (end_date >= start_date),
 currency text not null check (currency in ('USD','EUR','GBP','AUD','CAD','IDR','SGD')),
 invite_code uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now()
);
create table public.trip_members (
 trip_id uuid not null references public.trips(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 joined_at timestamptz not null default now(),
 primary key (trip_id, user_id)
);
create index trip_members_user on public.trip_members(user_id);
create table public.itinerary_items (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
 title text not null check (char_length(title) between 1 and 160),
 activity_date date not null, activity_time time not null,
 place text not null default '' check (char_length(place) <= 200), notes text not null default '' check (char_length(notes) <= 2000)
);
create index itinerary_trip on public.itinerary_items(trip_id);
create table public.places (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 160), notes text not null default '' check (char_length(notes) <= 2000),
 latitude double precision not null check (latitude between -90 and 90), longitude double precision not null check (longitude between -180 and 180)
);
create index places_trip on public.places(trip_id);
create table public.expenses (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
 description text not null check (char_length(description) between 1 and 160),
 amount_cents bigint not null check (amount_cents between 1 and 100000000000),
 payer_id uuid not null, created_at timestamptz not null default now(),
 unique(id, trip_id), foreign key (trip_id, payer_id) references public.trip_members(trip_id, user_id)
);
create index expenses_trip on public.expenses(trip_id);
create table public.expense_participants (
 expense_id uuid not null, trip_id uuid not null, user_id uuid not null,
 primary key (expense_id, user_id),
 foreign key (expense_id, trip_id) references public.expenses(id, trip_id) on delete cascade,
 foreign key (trip_id, user_id) references public.trip_members(trip_id, user_id)
);
create index participants_trip on public.expense_participants(trip_id);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
 title text not null check (char_length(title) between 1 and 160), category text not null check(category in ('packing','task')),
 completed boolean not null default false
);
create index tasks_trip on public.tasks(trip_id);

-- These helpers have a fixed search_path and bypass RLS only to avoid recursive membership policies.
create function public.is_trip_member(p_trip_id uuid) returns boolean language sql stable security definer set search_path = public as $$
 select exists(select 1 from public.trip_members where trip_id = p_trip_id and user_id = auth.uid());
$$;
create function public.shares_trip(p_user_id uuid) returns boolean language sql stable security definer set search_path = public as $$
 select exists(select 1 from public.trip_members a join public.trip_members b on a.trip_id=b.trip_id where a.user_id=auth.uid() and b.user_id=p_user_id);
$$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
 insert into public.profiles(id, display_name) values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'Traveler'),80));
 return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id, display_name) select id, left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'), ''), 'Traveler'),80) from auth.users on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.places enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;
alter table public.tasks enable row level security;
create policy profile_read on public.profiles for select to authenticated using (id=auth.uid() or public.shares_trip(id));
create policy profile_update on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy trip_read on public.trips for select to authenticated using (public.is_trip_member(id));
create policy members_read on public.trip_members for select to authenticated using (public.is_trip_member(trip_id));
create policy itinerary_shared on public.itinerary_items for all to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy places_shared on public.places for all to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy tasks_shared on public.tasks for all to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy expenses_read on public.expenses for select to authenticated using (public.is_trip_member(trip_id));
create policy expenses_delete on public.expenses for delete to authenticated using (public.is_trip_member(trip_id));
create policy participants_read on public.expense_participants for select to authenticated using (public.is_trip_member(trip_id));

create function public.create_trip(p_name text, p_destination text, p_start date, p_end date, p_currency text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Please sign in'; end if;
 insert into public.trips(owner_id,name,destination,start_date,end_date,currency) values(auth.uid(),trim(p_name),trim(p_destination),p_start,p_end,p_currency) returning id into v_id;
 insert into public.trip_members(trip_id,user_id) values(v_id,auth.uid());
 return v_id;
end; $$;
-- Possession of the unguessable invite UUID is the explicit join capability.
create function public.join_trip(p_code uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Please sign in'; end if;
 select id into v_id from public.trips where invite_code=p_code;
 if v_id is null then raise exception 'This invite is invalid or has been replaced'; end if;
 insert into public.trip_members(trip_id,user_id) values(v_id,auth.uid()) on conflict do nothing;
 return v_id;
end; $$;
create function public.rotate_invite(p_trip_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_code uuid;
begin
 update public.trips set invite_code=gen_random_uuid() where id=p_trip_id and owner_id=auth.uid() returning invite_code into v_code;
 if v_code is null then raise exception 'Only the trip creator can replace the invite'; end if;
 return v_code;
end; $$;
-- Both expense and all participants commit together, or not at all.
create function public.save_expense(p_trip_id uuid, p_description text, p_amount_cents bigint, p_payer uuid, p_participants uuid[], p_id uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.is_trip_member(p_trip_id) then raise exception 'Trip access denied'; end if;
 if coalesce(cardinality(p_participants),0)=0 then raise exception 'Select at least one participant'; end if;
 if exists(select 1 from unnest(p_participants) u where u is null or not exists(select 1 from public.trip_members m where m.trip_id=p_trip_id and m.user_id=u)) then raise exception 'Participants must belong to this trip'; end if;
 if not exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_payer) then raise exception 'Payer must belong to this trip'; end if;
 if p_id is null then
  insert into public.expenses(trip_id, description, amount_cents, payer_id) values(p_trip_id,trim(p_description),p_amount_cents,p_payer) returning id into v_id;
 else
  update public.expenses set description=trim(p_description),amount_cents=p_amount_cents,payer_id=p_payer where id=p_id and trip_id=p_trip_id returning id into v_id;
  if v_id is null then raise exception 'Expense no longer exists'; end if;
  delete from public.expense_participants where expense_id=v_id;
 end if;
 insert into public.expense_participants(expense_id,trip_id,user_id) select v_id,p_trip_id,u from (select distinct unnest(p_participants) u) s;
 return v_id;
end; $$;

-- No direct membership, trip, or expense-participant writes, even if default grants change.
revoke all on public.profiles,public.trips,public.trip_members,public.itinerary_items,public.places,public.expenses,public.expense_participants,public.tasks from anon, authenticated;
grant select on public.profiles,public.trips,public.trip_members,public.expenses,public.expense_participants to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant select,insert,update,delete on public.itinerary_items,public.places,public.tasks to authenticated;
grant delete on public.expenses to authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;
revoke all on function public.is_trip_member(uuid),public.shares_trip(uuid),public.create_trip(text,text,date,date,text),public.join_trip(uuid),public.rotate_invite(uuid),public.save_expense(uuid,text,bigint,uuid,uuid[],uuid) from public,anon;
grant execute on function public.is_trip_member(uuid),public.shares_trip(uuid),public.create_trip(text,text,date,date,text),public.join_trip(uuid),public.rotate_invite(uuid),public.save_expense(uuid,text,bigint,uuid,uuid[],uuid) to authenticated;
-- Changes are also refreshed every 15 seconds, including deletes.
alter publication supabase_realtime add table public.trips,public.trip_members,public.itinerary_items,public.places,public.expenses,public.expense_participants,public.tasks;
commit;
