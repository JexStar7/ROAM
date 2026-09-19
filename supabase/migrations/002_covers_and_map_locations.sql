-- Additional migration for the existing MVP. Safe to rerun; does not delete trip data or files.
begin;

alter table public.trips add column if not exists cover_url text;
alter table public.trips add column if not exists cover_path text;
alter table public.places add column if not exists maps_url text;
alter table public.places alter column latitude drop not null;
alter table public.places alter column longitude drop not null;
alter table public.itinerary_items add column if not exists maps_url text;
alter table public.itinerary_items add column if not exists latitude double precision;
alter table public.itinerary_items add column if not exists longitude double precision;

-- Retain old public URLs and files, and recover their Storage paths for private signed reads.
update public.trips
set cover_path = substring(cover_url from '/storage/v1/object/(?:public|sign|authenticated)/trip-covers/([^?]+)')
where cover_path is null
  and substring(cover_url from '/storage/v1/object/(?:public|sign|authenticated)/trip-covers/([^?]+)') like id::text || '/%';
create index if not exists trips_cover_path on public.trips(cover_path) where cover_path is not null;

do $$
declare t text;
begin
 foreach t in array array['places','itinerary_items'] loop
  if not exists(select 1 from pg_constraint where conrelid=('public.'||t)::regclass and conname=t||'_location_pair') then
   execute format('alter table public.%I add constraint %I check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)) not valid',t,t||'_location_pair');
  end if;
  if not exists(select 1 from pg_constraint where conrelid=('public.'||t)::regclass and conname=t||'_maps_link') then
   execute format('alter table public.%I add constraint %I check (maps_url is null or (char_length(maps_url) <= 4096 and maps_url like ''https://%%'')) not valid',t,t||'_maps_link');
  end if;
 end loop;
end $$;

-- Restore the non-recursive membership helper and keep the affected tables under RLS.
create or replace function public.is_trip_member(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
 select exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=auth.uid());
$$;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.places enable row level security;
alter table public.itinerary_items enable row level security;

-- Restrictive guards cannot be bypassed by a permissive policy added during manual troubleshooting.
drop policy if exists mvp_trip_boundary on public.trips;
create policy mvp_trip_boundary on public.trips as restrictive for all to public
 using (public.is_trip_member(id)) with check (public.is_trip_member(id));
drop policy if exists mvp_member_boundary on public.trip_members;
create policy mvp_member_boundary on public.trip_members as restrictive for all to public
 using (public.is_trip_member(trip_id)) with check (false);
drop policy if exists mvp_no_member_delete on public.trip_members;
create policy mvp_no_member_delete on public.trip_members as restrictive for delete to public using (false);
drop policy if exists mvp_places_boundary on public.places;
create policy mvp_places_boundary on public.places as restrictive for all to public
 using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
drop policy if exists mvp_itinerary_boundary on public.itinerary_items;
create policy mvp_itinerary_boundary on public.itinerary_items as restrictive for all to public
 using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- Trip writes (including the cover pointer) and membership changes remain RPC-only.
revoke all on public.trips, public.trip_members from public, anon, authenticated;
-- Table-level REVOKE alone does not remove manually added column grants.
do $$
declare t text; cols text;
begin
 foreach t in array array['trips','trip_members'] loop
  select string_agg(quote_ident(attname), ',') into cols from pg_attribute
   where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
  execute format('revoke insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',cols,cols,cols,t);
 end loop;
end $$;
grant select on public.trips, public.trip_members to authenticated;
grant select, insert, update, delete on public.places, public.itinerary_items to authenticated;
revoke all on function public.is_trip_member(uuid) from public, anon;
grant execute on function public.is_trip_member(uuid) to authenticated;

-- Keep the existing bucket and every existing object. Covers are shared only with trip members.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('trip-covers','trip-covers',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false, file_size_limit=5242880,
 allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create or replace function public.can_access_trip_cover(p_name text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.trip_members
  where user_id=auth.uid() and trip_id::text=split_part(p_name,'/',1))
  and split_part(p_name,'/',2)<>'' and split_part(p_name,'/',3)=''
  and position('..' in p_name)=0;
$$;
create or replace function public.can_delete_trip_cover(p_name text) returns boolean
language sql stable security definer set search_path=public as $$
 select public.can_access_trip_cover(p_name)
  and not exists(select 1 from public.trips where cover_path=p_name);
$$;
revoke all on function public.can_access_trip_cover(text),public.can_delete_trip_cover(text) from public,anon;
-- Anonymous callers may evaluate the guards, but auth.uid() is null so both return false.
grant execute on function public.can_access_trip_cover(text),public.can_delete_trip_cover(text) to authenticated,anon;

-- Keep RLS enabled. No broad policies for other buckets are removed.
drop policy if exists mvp_cover_select_guard on storage.objects;
create policy mvp_cover_select_guard on storage.objects as restrictive for select to public
 using(bucket_id<>'trip-covers' or (auth.role()='authenticated' and public.can_access_trip_cover(name)));
drop policy if exists mvp_cover_insert_guard on storage.objects;
create policy mvp_cover_insert_guard on storage.objects as restrictive for insert to public
 with check(bucket_id<>'trip-covers' or (auth.role()='authenticated' and public.can_access_trip_cover(name)));
drop policy if exists mvp_cover_update_guard on storage.objects;
create policy mvp_cover_update_guard on storage.objects as restrictive for update to public
 using(bucket_id<>'trip-covers') with check(bucket_id<>'trip-covers');
drop policy if exists mvp_cover_delete_guard on storage.objects;
create policy mvp_cover_delete_guard on storage.objects as restrictive for delete to public
 using(bucket_id<>'trip-covers' or (auth.role()='authenticated' and public.can_delete_trip_cover(name)));

drop policy if exists mvp_cover_read on storage.objects;
create policy mvp_cover_read on storage.objects for select to authenticated
 using(bucket_id='trip-covers' and public.can_access_trip_cover(name));
drop policy if exists mvp_cover_upload on storage.objects;
create policy mvp_cover_upload on storage.objects for insert to authenticated
 with check(bucket_id='trip-covers' and public.can_access_trip_cover(name));
drop policy if exists mvp_cover_remove on storage.objects;
create policy mvp_cover_remove on storage.objects for delete to authenticated
 using(bucket_id='trip-covers' and public.can_delete_trip_cover(name));
grant select,insert,delete on storage.objects to authenticated;

create or replace function public.set_trip_cover(p_trip_id uuid, p_path text, p_expected_path text)
returns void language plpgsql security definer set search_path=public as $$
declare v_path text;
begin
 if auth.uid() is null or not public.is_trip_member(p_trip_id) then raise exception 'Trip access denied'; end if;
 select cover_path into v_path from public.trips where id=p_trip_id for update;
 if not found then raise exception 'Trip no longer exists'; end if;
 if v_path is distinct from p_expected_path then raise exception 'The cover changed. Refresh the trip and try again.'; end if;
 if p_path is not null then
  if split_part(p_path,'/',1)<>p_trip_id::text or not public.can_access_trip_cover(p_path) then
   raise exception 'Cover must belong to this trip';
  end if;
  perform 1 from storage.objects where bucket_id='trip-covers' and name=p_path for update;
  if not found then raise exception 'Upload the cover before saving it'; end if;
 end if;
 update public.trips set cover_path=p_path, cover_url=null where id=p_trip_id;
end $$;
revoke all on function public.set_trip_cover(uuid,text,text) from public,anon;
grant execute on function public.set_trip_cover(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
