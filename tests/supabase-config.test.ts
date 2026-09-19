import { test } from "node:test";
import assert from "node:assert/strict";
import { getSupabaseConfig } from "../lib/supabase-config";

test("copied .env.example cannot initialize a client against the placeholder host", () => {
  assert.equal(
    getSupabaseConfig(
      "https://YOUR_PROJECT.supabase.co",
      "YOUR_PUBLISHABLE_KEY",
    ),
    null,
  );
  assert.equal(
    getSupabaseConfig(
      "https://YOUR_PROJECT.supabase.co",
      "sb_publishable_test",
    ),
    null,
  );
  assert.equal(
    getSupabaseConfig("https://project.supabase.co", "YOUR_PUBLISHABLE_KEY"),
    null,
  );
});

test("missing or invalid configuration does not initialize a client", () => {
  assert.equal(getSupabaseConfig(undefined, undefined), null);
  assert.equal(getSupabaseConfig("", "key"), null);
  assert.equal(getSupabaseConfig("not a URL", "key"), null);
  assert.equal(getSupabaseConfig("file:///tmp/supabase", "key"), null);
});

test("valid configuration is preserved, including local Supabase and legacy keys", () => {
  assert.deepEqual(
    getSupabaseConfig(" https://project.supabase.co ", " sb_publishable_test "),
    { url: "https://project.supabase.co", key: "sb_publishable_test" },
  );
  assert.deepEqual(getSupabaseConfig("http://127.0.0.1:54321", "legacy-jwt"), {
    url: "http://127.0.0.1:54321",
    key: "legacy-jwt",
  });
});

test("the actual client supports ANON_KEY and sends signup to the configured project", async (t) => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const oldAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  t.after(() => {
    for (const [name, value] of [
      ["NEXT_PUBLIC_SUPABASE_URL", oldUrl],
      ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", oldKey],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", oldAnon],
    ]) {
      if (value === undefined) delete process.env[name!];
      else process.env[name!] = value;
    }
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      calls++;
      assert.equal(
        String(input),
        "https://project.supabase.co/auth/v1/signup?redirect_to=http%3A%2F%2Flocalhost%3A3000",
      );
      assert.equal(init?.method, "POST");
      assert.equal(
        new Headers(init?.headers).get("apikey"),
        "sb_publishable_test",
      );
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.email, "signup-test@example.com");
      assert.equal(payload.data.display_name, "Signup test");
      return new Response(
        JSON.stringify({
          id: "11111111-1111-4111-8111-111111111111",
          email: payload.email,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  );
  const { supabase } = await import("../lib/supabase");
  assert.ok(supabase);
  const { data, error } = await supabase.auth.signUp({
    email: "signup-test@example.com",
    password: "test-password-only",
    options: {
      data: { display_name: "Signup test" },
      emailRedirectTo: "http://localhost:3000",
    },
  });
  assert.equal(error, null);
  assert.ok(data.user);
  assert.equal(calls, 1);
});
