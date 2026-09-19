import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balances,
  settlements,
  distanceKm,
  parseCents,
} from "../lib/calculations";
import type { Expense } from "../lib/types";
const expense = (
  amount: number,
  payer: string,
  participants: string[],
): Expense => ({
  id: "e",
  trip_id: "t",
  description: "Test",
  amount_cents: amount,
  payer_id: payer,
  expense_participants: participants.map((user_id) => ({ user_id })),
});
test("uneven split conserves every cent and is stable across participant order", () => {
  const a = balances([expense(100, "a", ["c", "a", "b"])]);
  assert.deepEqual(a, { a: 66, b: -33, c: -33 });
  assert.deepEqual(a, balances([expense(100, "a", ["b", "c", "a"])]));
  assert.equal(
    Object.values(a).reduce((s, n) => s + n, 0),
    0,
  );
});
test("settlements cancel all balances including payer outside participants", () => {
  const expenses = [
    expense(1001, "a", ["b", "c"]),
    expense(377, "c", ["a", "b", "c"]),
    expense(500, "b", ["a", "c"]),
  ];
  const net = balances(expenses);
  for (const s of settlements(expenses)) {
    net[s.from] += s.amount;
    net[s.to] -= s.amount;
  }
  assert.ok(Object.values(net).every((n) => n === 0));
});
test("zero expenses are settled and invalid expense is rejected", () => {
  assert.deepEqual(settlements([]), []);
  assert.throws(() => balances([expense(100, "a", [])]));
});
test("money parses decimal exactly and rejects malformed or unsafe values", () => {
  assert.equal(parseCents("10.01"), 1001);
  assert.equal(parseCents("0.29"), 29);
  for (const value of [
    "-1",
    "0",
    "1.001",
    "NaN",
    "Infinity",
    "1e3",
    "999999999999999",
  ])
    assert.throws(() => parseCents(value));
});
test("Haversine handles same point, nearby points and antipodes", () => {
  assert.equal(
    distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }),
    0,
  );
  assert.ok(
    Math.abs(
      distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) -
        111.195,
    ) < 0.01,
  );
  assert.ok(
    Number.isFinite(
      distanceKm(
        { latitude: 90, longitude: 0 },
        { latitude: -90, longitude: 0 },
      ),
    ),
  );
});
