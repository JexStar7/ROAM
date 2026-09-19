/** Reject the copy-and-paste template before the SDK can issue network requests. */
export function getSupabaseConfig(
  rawUrl: string | undefined,
  rawKey: string | undefined,
): { url: string; key: string } | null {
  const url = rawUrl?.trim();
  const key = rawKey?.trim();
  if (!url || !key || key === "YOUR_PUBLISHABLE_KEY") return null;

  try {
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.hostname.toLowerCase() === "your_project.supabase.co"
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return { url, key };
}
