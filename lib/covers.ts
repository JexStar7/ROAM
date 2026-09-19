import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip } from "./types";

export const COVER_BUCKET = "trip-covers";
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateCoverFile(file: File) {
  if (!imageTypes[file.type])
    throw new Error("Choose a JPEG, PNG or WebP image.");
  if (file.size < 1 || file.size > MAX_COVER_BYTES)
    throw new Error("Choose an image smaller than 5 MB.");
}

export function tripCoverPath(
  trip: Pick<Trip, "id" | "cover_path" | "cover_url">,
): string | null {
  let path = trip.cover_path || null;
  if (!path && trip.cover_url) {
    try {
      const url = new URL(trip.cover_url);
      const match = url.pathname.match(
        /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/trip-covers\/(.+)$/,
      );
      if (match) path = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  return path?.startsWith(`${trip.id}/`) &&
    !path.includes("..") &&
    path.split("/").length === 2
    ? path
    : null;
}

/** Upload uniquely, commit a member-checked pointer, then retire the old object. */
export async function saveTripCover(
  client: SupabaseClient,
  trip: Pick<Trip, "id" | "cover_path" | "cover_url">,
  file: File | null,
) {
  const bucket = client.storage.from(COVER_BUCKET);
  const previous = tripCoverPath(trip);
  let path: string | null = null;
  if (file) {
    validateCoverFile(file);
    path = `${trip.id}/${crypto.randomUUID()}.${imageTypes[file.type]}`;
    const upload = await bucket.upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "3600",
    });
    if (upload.error) throw new Error(upload.error.message);
  }
  try {
    const result = await client.rpc("set_trip_cover", {
      p_trip_id: trip.id,
      p_path: path,
      p_expected_path: previous,
    });
    if (result.error) throw new Error(result.error.message);
  } catch (error) {
    // The delete policy protects a committed pointer even if its response was lost.
    if (path) await bucket.remove([path]).catch(() => undefined);
    throw error;
  }
  let warning: string | null = null;
  if (previous && previous !== path) {
    try {
      const cleanup = await bucket.remove([previous]);
      if (cleanup.error)
        warning =
          "Cover saved. The unused old image could not be removed from Storage.";
    } catch {
      warning =
        "Cover saved. The unused old image could not be removed from Storage.";
    }
  }
  return { path, warning };
}
