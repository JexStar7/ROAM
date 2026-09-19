import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("migration, RLS isolation, invite membership and atomic expense validation", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth, public to authenticated, anon;
   grant execute on function auth.uid() to authenticated, anon;
   create publication supabase_realtime;`);
    await db.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
    const owner = "11111111-1111-4111-8111-111111111111",
      friend = "22222222-2222-4222-8222-222222222222",
      outsider = "33333333-3333-4333-8333-333333333333";
    for (const [id, name] of [
      [owner, "Owner"],
      [friend, "Friend"],
      [outsider, "Outsider"],
    ])
      await db.query(`insert into auth.users values ($1,$2)`, [
        id,
        JSON.stringify({ display_name: name }),
      ]);
    const asUser = async (id: string) => {
      await db.exec("reset role; set role authenticated");
      await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
        id,
      ]);
    };
    await asUser(owner);
    const created = await db.query<{ id: string }>(
      `select public.create_trip('Trip','Bali','2026-10-12','2026-10-17','USD') id`,
    );
    const trip = created.rows[0].id;
    const invite = (
      await db.query<{ invite_code: string }>(
        `select invite_code from public.trips where id=$1`,
        [trip],
      )
    ).rows[0].invite_code;
    await db.query(
      `insert into public.itinerary_items(trip_id,title,activity_date,activity_time) values($1,'Walk','2026-10-12','09:00')`,
      [trip],
    );
    await asUser(outsider);
    for (const table of [
      "trips",
      "trip_members",
      "itinerary_items",
      "places",
      "expenses",
      "expense_participants",
      "tasks",
    ])
      assert.equal(
        (await db.query(`select * from public.${table}`)).rows.length,
        0,
        `${table} leaked`,
      );
    assert.equal(
      (await db.query(`select * from public.profiles`)).rows.length,
      1,
    );
    await assert.rejects(
      db.query(
        `insert into public.tasks(trip_id,title,category) values($1,'Bad','task')`,
        [trip],
      ),
    );
    await assert.rejects(
      db.query(
        `insert into public.trip_members(trip_id,user_id) values($1,$2)`,
        [trip, outsider],
      ),
    );
    await assert.rejects(
      db.query(
        `select public.save_expense($1,'Bad',100,$2,array[$2]::uuid[])`,
        [trip, outsider],
      ),
    );
    await assert.rejects(db.query(`select public.rotate_invite($1)`, [trip]));
    await asUser(friend);
    await db.query(`select public.join_trip($1)`, [invite]);
    await db.query(`select public.join_trip($1)`, [invite]); // idempotent membership
    assert.equal(
      (await db.query(`select * from public.trip_members`)).rows.length,
      2,
    );
    assert.equal(
      (await db.query(`select * from public.itinerary_items`)).rows.length,
      1,
    );
    assert.equal(
      (await db.query(`select * from public.profiles`)).rows.length,
      2,
    );
    await assert.rejects(
      db.query(
        `select public.save_expense($1,'Bad payer',100,$2,array[$3]::uuid[])`,
        [trip, outsider, friend],
      ),
    );
    await assert.rejects(
      db.query(
        `select public.save_expense($1,'Negative',-100,$2,array[$2]::uuid[])`,
        [trip, friend],
      ),
    );
    const exp = (
      await db.query<{ id: string }>(
        `select public.save_expense($1,'Lunch',1001,$2,array[$2,$3]::uuid[]) id`,
        [trip, owner, friend],
      )
    ).rows[0].id;
    assert.equal(
      (await db.query(`select * from public.expense_participants`)).rows.length,
      2,
    );
    await assert.rejects(
      db.query(
        `select public.save_expense($1,'Bad',200,$2,array[$3]::uuid[],$4)`,
        [trip, owner, outsider, exp],
      ),
    );
    assert.equal(
      (
        await db.query<{ description: string }>(
          `select description from public.expenses`,
        )
      ).rows[0].description,
      "Lunch",
    );
    await assert.rejects(
      db.query(`select public.save_expense($1,'Bad',100,$2,array[]::uuid[])`, [
        trip,
        owner,
      ]),
    );
    await assert.rejects(
      db.query(`insert into public.expense_participants values($1,$2,$3)`, [
        exp,
        trip,
        outsider,
      ]),
    );
    await asUser(owner);
    await db.query(`select public.rotate_invite($1)`, [trip]);
    await asUser(outsider);
    await assert.rejects(db.query(`select public.join_trip($1)`, [invite]));
    const other = (
      await db.query<{ id: string }>(
        `select public.create_trip('Other','Kyoto','2026-10-12','2026-10-17','USD') id`,
      )
    ).rows[0].id;
    await assert.rejects(
      db.query(
        `select public.save_expense($1,'Cross-trip',100,$2,array[$2]::uuid[],$3)`,
        [other, outsider, exp],
      ),
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query(`select * from public.trips`));
    await assert.rejects(db.query(`select public.join_trip($1)`, [invite]));
  } finally {
    await db.close();
  }
});
