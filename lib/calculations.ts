import type { Expense } from "./types";
// Integer cents, with remainder assigned in UUID order: no lost pennies.
export function balances(expenses: Expense[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of expenses) {
    const ids = [
      ...new Set(e.expense_participants.map((p) => p.user_id)),
    ].sort();
    if (
      !ids.length ||
      !Number.isSafeInteger(e.amount_cents) ||
      e.amount_cents < 1
    )
      throw new Error("Invalid expense");
    result[e.payer_id] = (result[e.payer_id] || 0) + e.amount_cents;
    const share = Math.floor(e.amount_cents / ids.length),
      remainder = e.amount_cents % ids.length;
    ids.forEach((id, i) => {
      result[id] = (result[id] || 0) - share - (i < remainder ? 1 : 0);
    });
  }
  return result;
}
export function settlements(expenses: Expense[]) {
  const entries = Object.entries(balances(expenses)).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const debtors = entries
    .filter(([, v]) => v < 0)
    .map(([id, value]) => ({ id, amount: -value }));
  const creditors = entries
    .filter(([, v]) => v > 0)
    .map(([id, amount]) => ({ id, amount }));
  const result: { from: string; to: string; amount: number }[] = [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    result.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (!debtors[i].amount) i++;
    if (!creditors[j].amount) j++;
  }
  return result;
}
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return (
    6371 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export function parseCents(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a positive amount with up to 2 decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000000)
    throw new Error("Amount must be between 0.01 and 1,000,000,000.");
  return cents;
}
export const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).format(
    cents / 100,
  );
export const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) => new Date(`${date}T12:00:00`).toLocaleDateString("en", options);
