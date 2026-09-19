import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./supabase-config";

// Keep direct NEXT_PUBLIC_ references so Next.js includes them in the browser bundle.
const config =
  getSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ) ||
  getSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
export const supabase = config ? createClient(config.url, config.key) : null;
