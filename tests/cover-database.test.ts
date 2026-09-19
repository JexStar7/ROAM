import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("additive migration preserves data, repairs cover access, and guards against permissive manual policies", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111",
    friend = "22222222-2222-4222-8222-222222222222",
    outsider = "33333333-3333-4333-8333-333333333333";
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
   grant usage on schema auth,public to authenticated,anon;
   grant execute on function auth.uid(),auth.role() to authenticated,anon;
   create publication supabase_realtime;
   create schema storage;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
   alter table storage.objects enable row level security;
   grant usage on schema storage to authenticated,anon;
   grant all on storage.objects to authenticated,anon;
   create policy manual_storage_allow_all on storage.objects for all to authenticated,anon using(true) with check(true);`);
    await db.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
    for (const [id, name] of [
      [owner, "Owner"],
      [friend, "Friend"],
      [outsider, "Outsider"],
    ])
      await db.query("insert into auth.users values($1,$2)", [
        id,
        JSON.stringify({ display_name: name }),
      ]);
    const asUser = async (id: string) => {
      await db.exec("reset role; set role authenticated");
      await db.query(
        `select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)`,
        [id],
      );
    };
    await asUser(owner);
    const trip = (
      await db.query<{ id: string }>(
        `select public.create_trip('Original trip','Bali','2026-10-12','2026-10-17','USD') id`,
      )
    ).rows[0].id;
    const code = (
      await db.query<{ invite_code: string }>(
        `select invite_code from public.trips where id=$1`,
        [trip],
      )
    ).rows[0].invite_code;
    const oldPath = `${trip}/old.jpg`,
      nextPath = `${trip}/next.webp`;
    const legacyUrl = `https://project.supabase.co/storage/v1/object/public/trip-covers/${oldPath}`;
    await db.query(
      `insert into public.places(trip_id,name,latitude,longitude,notes) values($1,'Original place',-8.5,115.2,'Keep me')`,
      [trip],
    );
    await db.exec("reset role");
    await db.exec(`alter table public.trips add column cover_url text;
   grant all on public.trips to authenticated; grant update(owner_id) on public.trips to authenticated;
   grant insert,update,delete on public.trip_members to authenticated;
   create policy manual_trip_allow_all on public.trips for all to authenticated using(true) with check(true);
   create policy manual_members_allow_all on public.trip_members for all to authenticated using(true) with check(true);
   create policy manual_places_allow_all on public.places for all to authenticated using(true) with check(true);
   insert into storage.buckets(id,name,public) values('trip-covers','trip-covers',true),('unrelated','unrelated',true);`);
    await db.query(`update public.trips set cover_url=$1 where id=$2`, [
      legacyUrl,
      trip,
    ]);
    await db.query(
      `insert into storage.objects(bucket_id,name) values('trip-covers',$1),('unrelated','keep.txt')`,
      [oldPath],
    );
    const migration = readFileSync(
      "supabase/migrations/002_covers_and_map_locations.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration); // rerunnable after partial manual setup
    const stored = (
      await db.query<{ cover_path: string; cover_url: string; name: string }>(
        `select cover_path,cover_url,name from public.trips where id=$1`,
        [trip],
      )
    ).rows[0];
    assert.equal(stored.cover_path, oldPath);
    assert.equal(stored.cover_url, legacyUrl);
    assert.equal(stored.name, "Original trip");
    assert.equal(
      (
        await db.query<{ public: boolean }>(
          `select public from storage.buckets where id='trip-covers'`,
        )
      ).rows[0].public,
      false,
    );
    assert.equal(
      (await db.query(`select * from public.places where notes='Keep me'`)).rows
        .length,
      1,
    );
    await asUser(outsider);
    assert.equal((await db.query("select * from public.trips")).rows.length, 0);
    assert.equal(
      (await db.query("select * from public.places")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `select * from storage.objects where bucket_id='trip-covers'`,
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `select * from storage.objects where bucket_id='unrelated'`,
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      db.query(
        `insert into storage.objects(bucket_id,name) values('trip-covers',$1)`,
        [nextPath],
      ),
    );
    await assert.rejects(
      db.query(
        `insert into storage.objects(bucket_id,name) values('trip-covers','not-a-uuid/file.jpg')`,
      ),
    );
    await assert.rejects(
      db.query(`select public.set_trip_cover($1,null,$2)`, [trip, oldPath]),
    );
    await assert.rejects(
      db.query(`insert into public.trip_members values($1,$2,now())`, [
        trip,
        outsider,
      ]),
    );
    await asUser(friend);
    await db.query(`select public.join_trip($1)`, [code]);
    assert.equal(
      (
        await db.query(
          `select * from storage.objects where bucket_id='trip-covers'`,
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      db.query(
        `update public.trips set cover_url='https://evil.test' where id=$1`,
        [trip],
      ),
    );
    await assert.rejects(
      db.query(`update public.trips set owner_id=$1 where id=$2`, [
        friend,
        trip,
      ]),
    );
    await db.query(
      `insert into storage.objects(bucket_id,name) values('trip-covers',$1)`,
      [nextPath],
    );
    await assert.rejects(
      db.query(`select public.set_trip_cover($1,$2,$3)`, [
        trip,
        `${trip}/missing.jpg`,
        oldPath,
      ]),
    );
    await assert.rejects(
      db.query(`select public.set_trip_cover($1,$2,$3)`, [
        trip,
        `${owner}/elsewhere.jpg`,
        oldPath,
      ]),
    );
    assert.equal(
      (
        await db.query(
          `delete from storage.objects where name=$1 returning name`,
          [oldPath],
        )
      ).rows.length,
      0,
      "active cover must not be deleted",
    );
    assert.equal(
      (
        await db.query(
          `update storage.objects set name=$1 where name=$2 returning name`,
          [`${trip}/overwritten.jpg`, oldPath],
        )
      ).rows.length,
      0,
      "existing covers cannot be overwritten",
    );
    await db.query(`select public.set_trip_cover($1,$2,$3)`, [
      trip,
      nextPath,
      oldPath,
    ]);
    await assert.rejects(
      db.query(`select public.set_trip_cover($1,null,$2)`, [trip, oldPath]),
      "stale update must fail",
    );
    assert.equal(
      (
        await db.query(
          `delete from storage.objects where name=$1 returning name`,
          [oldPath],
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          `delete from storage.objects where name=$1 returning name`,
          [nextPath],
        )
      ).rows.length,
      0,
    );
    await db.query(`select public.set_trip_cover($1,null,$2)`, [
      trip,
      nextPath,
    ]);
    assert.equal(
      (
        await db.query(
          `delete from storage.objects where name=$1 returning name`,
          [nextPath],
        )
      ).rows.length,
      1,
    );
    await db.query(
      `insert into public.places(trip_id,name,maps_url) values($1,'Short link','https://maps.app.goo.gl/test')`,
      [trip],
    );
    await db.query(
      `insert into public.itinerary_items(trip_id,title,activity_date,activity_time,place,maps_url,latitude,longitude) values($1,'Walk','2026-10-12','09:00','Ubud','https://www.google.com/maps/?q=-8.5,115.2',-8.5,115.2)`,
      [trip],
    );
    await assert.rejects(
      db.query(
        `insert into public.places(trip_id,name,latitude,longitude) values($1,'Invalid',100,0)`,
        [trip],
      ),
    );
    await assert.rejects(
      db.query(
        `insert into public.itinerary_items(trip_id,title,activity_date,activity_time,latitude) values($1,'Invalid','2026-10-12','09:00',1)`,
        [trip],
      ),
    );
    await asUser(outsider);
    assert.equal(
      (await db.query("select * from public.itinerary_items")).rows.length,
      0,
    );
    await db.exec("reset role; set role anon");
    await db.query(
      `select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','anon',false)`,
    );
    await assert.rejects(
      db.query(`select public.set_trip_cover($1,null,null)`, [trip]),
    );
    assert.equal(
      (
        await db.query(
          `select * from storage.objects where bucket_id='trip-covers'`,
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
