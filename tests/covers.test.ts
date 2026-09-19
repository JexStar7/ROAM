import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveTripCover, tripCoverPath, validateCoverFile } from "../lib/covers";
const id = "11111111-1111-4111-8111-111111111111";
const previous = `${id}/old.png`;
const file = () =>
  new File(["image bytes"], "cover.png", { type: "image/png" });
function mockClient(
  options: {
    uploadError?: boolean;
    rpcError?: boolean;
    rpcReject?: boolean;
    cleanupError?: boolean;
  } = {},
) {
  const events: string[] = [];
  let newPath = "";
  const bucket = {
    upload: async (path: string, _file: File, config: { upsert: boolean }) => {
      assert.equal(config.upsert, false);
      newPath = path;
      events.push("upload");
      return {
        error: options.uploadError ? { message: "Upload denied" } : null,
      };
    },
    remove: async (paths: string[]) => {
      events.push(`delete:${paths[0]}`);
      return {
        error: options.cleanupError ? { message: "Cleanup failed" } : null,
      };
    },
  };
  const client = {
    storage: {
      from: (name: string) => {
        assert.equal(name, "trip-covers");
        return bucket;
      },
    },
    rpc: async (
      name: string,
      args: {
        p_trip_id: string;
        p_path: string | null;
        p_expected_path: string | null;
      },
    ) => {
      events.push("commit");
      assert.equal(name, "set_trip_cover");
      assert.equal(args.p_trip_id, id);
      assert.equal(args.p_expected_path, previous);
      if (options.rpcReject) throw new Error("Network error");
      return { error: options.rpcError ? { message: "Cover changed" } : null };
    },
  } as unknown as SupabaseClient;
  return { client, events, getPath: () => newPath };
}
test("cover validation rejects empty, oversized and non-image uploads", () => {
  assert.throws(() =>
    validateCoverFile(new File([], "empty.png", { type: "image/png" })),
  );
  assert.throws(() =>
    validateCoverFile(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" })),
  );
  assert.throws(() =>
    validateCoverFile(
      new File([new Uint8Array(5242881)], "big.png", { type: "image/png" }),
    ),
  );
  assert.doesNotThrow(() => validateCoverFile(file()));
});
test("legacy cover URL resolves to the same trip Storage object", () => {
  assert.equal(
    tripCoverPath({
      id,
      cover_url: `https://project.supabase.co/storage/v1/object/public/trip-covers/${previous}`,
    }),
    previous,
  );
  assert.equal(
    tripCoverPath({ id, cover_path: "another-trip/cover.png" }),
    null,
  );
  assert.equal(tripCoverPath({ id, cover_path: `${id}/../cover.png` }), null);
});
test("replacement commits the new pointer before deleting the old object", async () => {
  const mock = mockClient();
  const result = await saveTripCover(
    mock.client,
    { id, cover_path: previous },
    file(),
  );
  assert.deepEqual(mock.events, ["upload", "commit", `delete:${previous}`]);
  assert.equal(result.path, mock.getPath());
  assert.equal(result.warning, null);
});
test("upload failures leave the pointer and old image untouched", async () => {
  const mock = mockClient({ uploadError: true });
  await assert.rejects(
    saveTripCover(mock.client, { id, cover_path: previous }, file()),
  );
  assert.deepEqual(mock.events, ["upload"]);
});
test("failed or rejected commits clean up only the new upload", async () => {
  for (const config of [{ rpcError: true }, { rpcReject: true }]) {
    const mock = mockClient(config);
    await assert.rejects(
      saveTripCover(mock.client, { id, cover_path: previous }, file()),
    );
    assert.deepEqual(mock.events, [
      "upload",
      "commit",
      `delete:${mock.getPath()}`,
    ]);
  }
});
test("remove clears the pointer before deleting, and cleanup failures do not undo a committed change", async () => {
  const mock = mockClient({ cleanupError: true });
  const result = await saveTripCover(
    mock.client,
    { id, cover_path: previous },
    null,
  );
  assert.deepEqual(mock.events, ["commit", `delete:${previous}`]);
  assert.equal(result.path, null);
  assert.ok(result.warning);
});
