import { distanceKm } from "./calculations";
import type { Activity, Place } from "./types";

export type Coordinates = { latitude: number; longitude: number };
export type MapLocation = {
  maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
const googleDomains = [
  "google.com",
  "google.co.uk",
  "google.co.id",
  "google.co.jp",
  "google.com.au",
  "google.co.nz",
  "google.co.in",
  "google.com.sg",
  "google.com.my",
  "google.ca",
  "google.de",
  "google.fr",
  "google.es",
  "google.it",
  "google.nl",
  "google.com.br",
  "google.com.mx",
  "google.co.th",
  "google.com.tw",
  "google.com.hk",
];

export function isGoogleMapsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return false;
    const host = url.hostname.toLowerCase();
    if (host === "maps.app.goo.gl") return url.pathname.length > 1;
    if (host === "goo.gl") return url.pathname.startsWith("/maps/");
    const domain = host.replace(/^(www\.|maps\.)/, "");
    return (
      googleDomains.includes(domain) &&
      (host.startsWith("maps.") || /^\/maps(?:\/|$)/.test(url.pathname))
    );
  } catch {
    return false;
  }
}

export function hasCoordinates(
  value: MapLocation,
): value is MapLocation & Coordinates {
  return (
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180
  );
}
const numeric = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
function pair(value: string | null): Coordinates | null {
  const match = value
    ?.trim()
    .match(new RegExp(`^(${numeric})\\s*,\\s*(${numeric})$`));
  if (!match) return null;
  const result = { latitude: Number(match[1]), longitude: Number(match[2]) };
  return hasCoordinates(result) ? result : null;
}

/** No URL fetching or geocoding: short links and named searches remain usable with unknown distance. */
export function parseMapsCoordinates(value: string): Coordinates | null {
  if (!isGoogleMapsUrl(value)) return null;
  const url = new URL(value);
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname + url.search);
  } catch {
    return null;
  }
  // A place pin takes precedence over the map camera's @lat,lng position.
  const pin = decoded.match(
    new RegExp(`!3d(${numeric})!4d(${numeric})(?=[!/?&#]|$)`),
  );
  if (pin) return pair(`${pin[1]},${pin[2]}`);
  // An incomplete or malformed pin must not silently become the camera position.
  if (/![34]d/.test(decoded)) return null;
  for (const key of ["destination", "query", "q"]) {
    const result = pair(url.searchParams.get(key));
    if (result) return result;
  }
  // A directions viewport is not necessarily the destination.
  if (/\/dir(?:\/|$)/.test(url.pathname)) return null;
  const camera = decoded.match(
    new RegExp(`@(${numeric}),(${numeric})(?:,|/|$)`),
  );
  return camera ? pair(`${camera[1]},${camera[2]}`) : null;
}

export function mapFields(value: string, previous?: MapLocation) {
  const maps_url = value.trim() || null;
  if (maps_url && (!isGoogleMapsUrl(maps_url) || maps_url.length > 4096)) {
    throw new Error(
      "Paste a valid HTTPS Google Maps link (up to 4096 characters).",
    );
  }
  let coordinates = maps_url ? parseMapsCoordinates(maps_url) : null;
  // Reparse every saved URL on edit, even if unchanged, to replace stale coordinates.
  // Only legacy rows without a URL retain their manually stored coordinates.
  if (
    !coordinates &&
    !maps_url &&
    !previous?.maps_url?.trim() &&
    previous &&
    hasCoordinates(previous)
  ) {
    coordinates = {
      latitude: previous.latitude,
      longitude: previous.longitude,
    };
  }
  return {
    maps_url,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
  };
}

export function mapsLink(value: MapLocation, name = ""): string | null {
  if (value.maps_url && isGoogleMapsUrl(value.maps_url)) return value.maps_url;
  const query = hasCoordinates(value)
    ? `${value.latitude},${value.longitude}`
    : name.trim();
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
}

export function nearbyLocations(
  places: Place[],
  activities: Activity[],
  position: Coordinates | null,
) {
  const entries = [
    ...places.map((item) => ({
      key: `place:${item.id}`,
      kind: "place" as const,
      name: item.name,
      item,
    })),
    ...activities
      .filter(
        (item) => item.place.trim() || item.maps_url || hasCoordinates(item),
      )
      .map((item) => ({
        key: `activity:${item.id}`,
        kind: "activity" as const,
        name: item.place.trim() || item.title,
        item,
      })),
  ];
  return entries
    .map((entry) => ({
      ...entry,
      distance:
        position && hasCoordinates(entry.item)
          ? distanceKm(position, entry.item)
          : null,
    }))
    .sort((a, b) => {
      if (position) {
        if (a.distance === null && b.distance !== null) return 1;
        if (a.distance !== null && b.distance === null) return -1;
        if (
          a.distance !== null &&
          b.distance !== null &&
          a.distance !== b.distance
        )
          return a.distance - b.distance;
      }
      return a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
    });
}
