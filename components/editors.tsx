"use client";
import { useState, type FormEvent } from "react";
import type { Activity, Expense, Member, Place, Task, Trip } from "@/lib/types";
import { Field } from "./ui";
import { hasCoordinates, mapsLink, parseMapsCoordinates } from "@/lib/maps";
export type EditorKind =
  "trip" | "join" | "activity" | "place" | "expense" | "task" | "cover";
export type Editable = Activity | Place | Expense | Task;
export default function Editor({
  kind,
  item,
  trip,
  members,
  onSave,
  busy,
  invite,
}: {
  kind: EditorKind;
  invite?: string;
  item?: Editable;
  trip?: Trip;
  members: Member[];
  onSave: (form: FormData) => Promise<void>;
  busy: boolean;
}) {
  const [error, setError] = useState("");
  const mapItem =
    kind === "activity" || kind === "place"
      ? (item as Activity | Place | undefined)
      : undefined;
  const [mapsUrl, setMapsUrl] = useState(
    mapItem?.maps_url ||
      (mapItem && hasCoordinates(mapItem) ? mapsLink(mapItem) : "") ||
      "",
  );
  async function removeCover() {
    setError("");
    const form = new FormData();
    form.set("remove_cover", "true");
    try {
      await onSave(form);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to remove cover. Please try again.",
      );
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      await onSave(new FormData(e.currentTarget));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save. Please try again.",
      );
    }
  }
  const activity = item as Activity | undefined,
    place = item as Place | undefined,
    expense = item as Expense | undefined,
    task = item as Task | undefined;
  return (
    <form className="form" onSubmit={submit}>
      <fieldset disabled={busy}>
        {kind === "trip" && (
          <>
            <Field label="Trip name">
              <input
                name="name"
                required
                maxLength={120}
                placeholder="A little escape to…"
              />
            </Field>
            <Field label="Trip cover (optional)">
              <input
                type="file"
                name="cover"
                accept="image/jpeg,image/png,image/webp"
              />
            </Field>
            <p className="muted small">JPEG, PNG or WebP · up to 5 MB</p>
            <Field label="Destination">
              <input
                name="destination"
                required
                maxLength={160}
                placeholder="Bali, Indonesia"
              />
            </Field>
            <div className="form-row">
              <Field label="Start date">
                <input name="start" type="date" required />
              </Field>
              <Field label="End date">
                <input name="end" type="date" required />
              </Field>
            </div>
            <Field label="Trip currency">
              <select name="currency">
                {["USD", "EUR", "GBP", "AUD", "CAD", "IDR", "SGD"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <p className="muted small">
              All expenses use this currency. Convert purchases before adding
              them.
            </p>
          </>
        )}
        {kind === "cover" && (
          <>
            <Field label="Trip cover">
              <input
                name="cover"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp"
              />
            </Field>
            <p className="muted small">
              JPEG, PNG or WebP · up to 5 MB. Your current cover stays until the
              new one is saved.
            </p>
            {(trip?.cover_path || trip?.cover_url) && (
              <button
                type="button"
                className="button secondary"
                onClick={removeCover}
              >
                Remove cover
              </button>
            )}
          </>
        )}
        {kind === "join" && (
          <>
            <p className="muted">
              Got a trip invite? Paste the link or invite code below.
            </p>
            <Field label="Invite link or code">
              <input
                name="code"
                required
                defaultValue={invite}
                placeholder="Paste your invite here"
              />
            </Field>
          </>
        )}
        {kind === "activity" && (
          <>
            <Field label="Activity">
              <input
                name="title"
                required
                maxLength={160}
                defaultValue={activity?.title}
                placeholder="What’s the plan?"
              />
            </Field>
            <div className="form-row">
              <Field label="Date">
                <input
                  name="date"
                  type="date"
                  required
                  min={trip?.start_date}
                  max={trip?.end_date}
                  defaultValue={activity?.activity_date || trip?.start_date}
                />
              </Field>
              <Field label="Time">
                <input
                  name="time"
                  type="time"
                  required
                  defaultValue={activity?.activity_time?.slice(0, 5) || "09:00"}
                />
              </Field>
            </div>
            <Field label="Place / location name">
              <input
                name="place"
                maxLength={200}
                defaultValue={activity?.place}
                placeholder="Where are we heading?"
              />
            </Field>
          </>
        )}
        {kind === "place" && (
          <Field label="Place name">
            <input
              name="name"
              required
              maxLength={160}
              defaultValue={place?.name}
              placeholder="Somewhere worth saving"
            />
          </Field>
        )}
        {(kind === "place" || kind === "activity") && (
          <>
            <Field label="Google Maps URL">
              <input
                name="maps_url"
                type="url"
                maxLength={4096}
                value={mapsUrl}
                onChange={(e) => setMapsUrl(e.target.value)}
                placeholder="Paste Google Maps link"
              />
            </Field>
            <p className="muted small">
              {mapsUrl && !parseMapsCoordinates(mapsUrl)
                ? "This link can be saved and opened in Maps. Distance is unavailable unless the URL contains coordinates."
                : "Coordinates are read from the link when available. Short links work too, without a distance."}
            </p>
            <Field label="Notes">
              <textarea
                name="notes"
                maxLength={2000}
                defaultValue={
                  kind === "activity" ? activity?.notes : place?.notes
                }
                placeholder="The little details…"
              />
            </Field>
          </>
        )}
        {kind === "expense" && (
          <>
            <Field label="Description">
              <input
                name="description"
                required
                maxLength={160}
                defaultValue={expense?.description}
                placeholder="Dinner, a ride, a little adventure…"
              />
            </Field>
            <Field label={`Amount (${trip?.currency || "USD"})`}>
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                max="1000000000"
                step="0.01"
                required
                defaultValue={
                  expense ? (expense.amount_cents / 100).toFixed(2) : undefined
                }
                placeholder="0.00"
              />
            </Field>
            <Field label="Paid by">
              <select name="payer" defaultValue={expense?.payer_id}>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="field">
              <span>Split equally between</span>
              <div className="participant-list">
                {members.map((m) => (
                  <label key={m.user_id} className="check-label">
                    <input
                      name="participants"
                      type="checkbox"
                      value={m.user_id}
                      defaultChecked={
                        expense
                          ? expense.expense_participants.some(
                              (p) => p.user_id === m.user_id,
                            )
                          : true
                      }
                    />
                    <span>{m.display_name}</span>
                  </label>
                ))}
              </div>
            </div>
            <p className="muted small">
              Any leftover cents are assigned in a stable member order.
            </p>
          </>
        )}
        {kind === "task" && (
          <>
            <Field label="What needs to come along or get done?">
              <input
                name="title"
                required
                maxLength={160}
                defaultValue={task?.title}
                placeholder="Don’t forget…"
              />
            </Field>
            <Field label="List">
              <select
                name="category"
                defaultValue={task?.category || "packing"}
              >
                <option value="packing">Packing</option>
                <option value="task">To do</option>
              </select>
            </Field>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" type="submit">
          {busy
            ? "Saving…"
            : kind === "join"
              ? "Join trip"
              : kind === "trip"
                ? "Create trip"
                : "Save changes"}
        </button>
      </fieldset>
    </form>
  );
}
