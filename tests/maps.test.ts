import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasCoordinates,
  isGoogleMapsUrl,
  mapFields,
  mapsLink,
  nearbyLocations,
  parseMapsCoordinates,
} from "../lib/maps";
import type { Activity, Place } from "../lib/types";

test("Maps query, encoded coordinates, destination and place pins parse with pin priority", () => {
  for (const url of [
    "https://www.google.com/maps/search/?api=1&query=-8.5%2C115.25",
    "https://maps.google.com/?q=-8.5,115.25",
    "https://www.google.co.id/maps/@-8.5,115.25,15z",
    "https://www.google.com/maps/place/Ubud/@0,0,5z/data=!4m2!3d-8.5!4d115.25",
    "https://www.google.com/maps/dir/?api=1&origin=1,1&destination=-8.5,115.25",
  ])
    assert.deepEqual(parseMapsCoordinates(url), {
      latitude: -8.5,
      longitude: 115.25,
    });
});
test("short links, named searches, bad coordinates and directions viewports have no fabricated distance", () => {
  for (const url of [
    "https://maps.app.goo.gl/abc123",
    "https://goo.gl/maps/abc123",
    "https://www.google.com/maps/search/?api=1&query=Ubud",
    "https://www.google.com/maps/?q=91,181",
    "https://www.google.com/maps/@91,181,5z",
    "https://www.google.com/maps/dir/Ubud/Bali/@1,1,12z",
    "https://www.google.com/maps/place/%ZZ",
  ])
    assert.equal(parseMapsCoordinates(url), null);
  assert.ok(hasCoordinates({ latitude: 0, longitude: 0 }));
  assert.equal(hasCoordinates({ latitude: null, longitude: 1 }), false);
  assert.equal(hasCoordinates({ latitude: NaN, longitude: Infinity }), false);
});
test("map links reject executable URLs and lookalike hosts", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://google.com.evil.test/maps/?q=0,0",
    "https://google.com@evil.test/maps",
    "https://evil.test/maps",
    "https://www.google.com/search?q=0,0",
  ]) {
    assert.equal(isGoogleMapsUrl(url), false);
    assert.throws(() => mapFields(url));
  }
  assert.equal(
    mapsLink({ maps_url: "javascript:alert(1)" }, "Ubud"),
    "https://www.google.com/maps/search/?api=1&query=Ubud",
  );
});
test("editing a legacy row preserves coordinates, but changing or removing a link clears stale coordinates", () => {
  assert.deepEqual(mapFields("", { latitude: 1, longitude: 2 }), {
    maps_url: null,
    latitude: 1,
    longitude: 2,
  });
  const previous = {
    maps_url: "https://www.google.com/maps/?q=1,2",
    latitude: 1,
    longitude: 2,
  };
  assert.deepEqual(mapFields("https://maps.app.goo.gl/abc", previous), {
    maps_url: "https://maps.app.goo.gl/abc",
    latitude: null,
    longitude: null,
  });
  assert.deepEqual(mapFields("", previous), {
    maps_url: null,
    latitude: null,
    longitude: null,
  });
});
test("Near Me includes both sources, nearest first then unknown locations, and does not confuse duplicate IDs", () => {
  const places: Place[] = [
    {
      id: "same",
      trip_id: "t",
      name: "Far",
      notes: "",
      latitude: 0,
      longitude: 2,
    },
    {
      id: "unknown",
      trip_id: "t",
      name: "Unknown",
      notes: "",
      latitude: null,
      longitude: null,
      maps_url: "https://maps.app.goo.gl/abc",
    },
  ];
  const activities: Activity[] = [
    {
      id: "same",
      trip_id: "t",
      title: "Breakfast",
      place: "Near",
      notes: "",
      activity_date: "2026-10-12",
      activity_time: "09:00",
      latitude: 0,
      longitude: 0.1,
    },
    {
      id: "blank",
      trip_id: "t",
      title: "Relax",
      place: "",
      notes: "",
      activity_date: "2026-10-12",
      activity_time: "10:00",
    },
  ];
  const rows = nearbyLocations(places, activities, {
    latitude: 0,
    longitude: 0,
  });
  assert.deepEqual(
    rows.map((r) => r.key),
    ["activity:same", "place:same", "place:unknown"],
  );
  assert.ok(rows[0].distance! < rows[1].distance!);
  assert.equal(rows[2].distance, null);
  assert.equal(mapsLink(rows[2].item), "https://maps.app.goo.gl/abc");
  assert.equal(nearbyLocations(places, activities, null).length, 3);
});

test("place coordinates beat the camera when the pin ends before a query or fragment", () => {
  for (const suffix of [
    "",
    "?entry=ttu",
    "#details",
    "/?entry=ttu",
    "!16splace?entry=ttu",
  ]) {
    const url = `https://www.google.com/maps/place/Ubud/@-8.6,115.3,15z/data=!3d-8.5!4d115.25${suffix}`;
    assert.deepEqual(parseMapsCoordinates(url), {
      latitude: -8.5,
      longitude: 115.25,
    });
  }
  assert.deepEqual(
    parseMapsCoordinates(
      "https://www.google.com/maps/place/Ubud/@0,0,15z/data=%213d-8.5%214d115.25?entry=ttu",
    ),
    { latitude: -8.5, longitude: 115.25 },
  );
});

test("camera fallback requires both place-coordinate markers to be absent", () => {
  const base = "https://www.google.com/maps/place/Ubud/@-8.6,115.3,15z";
  for (const pin of [
    "!3d-8.5",
    "!4d115.25",
    "!3dbad!4d115.25",
    "!3d-8.5!4dbad",
    "!3d91!4d115.25",
    "!3d-8.5!4d181",
  ]) {
    assert.equal(parseMapsCoordinates(`${base}/data=${pin}?entry=ttu`), null);
  }
  assert.deepEqual(parseMapsCoordinates(base), {
    latitude: -8.6,
    longitude: 115.3,
  });
});

test("saving an existing unchanged Maps URL replaces old camera coordinates with place coordinates", () => {
  const maps_url =
    "https://www.google.com/maps/place/Ubud/@-8.6,115.3,15z/data=!3d-8.5!4d115.25?entry=ttu";
  const previous = { maps_url, latitude: -8.6, longitude: 115.3 };
  // Both Place and Activity edit-save branches spread mapFields into their update payload.
  assert.deepEqual(mapFields(maps_url, previous), {
    maps_url,
    latitude: -8.5,
    longitude: 115.25,
  });
});

test("re-saving an unparseable URL clears stale coordinates instead of preserving an old camera location", () => {
  for (const maps_url of [
    "https://www.google.com/maps/place/Ubud/@-8.6,115.3,15z/data=!3d-8.5",
    "https://maps.app.goo.gl/abc123",
  ]) {
    assert.deepEqual(
      mapFields(maps_url, { maps_url, latitude: -8.6, longitude: 115.3 }),
      {
        maps_url,
        latitude: null,
        longitude: null,
      },
    );
  }
});
