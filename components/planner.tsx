"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  Compass,
  Copy,
  Edit3,
  ListChecks,
  LoaderCircle,
  LogOut,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  balances,
  dateLabel,
  money,
  parseCents,
  settlements,
} from "@/lib/calculations";
import { mapFields, mapsLink, nearbyLocations } from "@/lib/maps";
import { saveTripCover, validateCoverFile } from "@/lib/covers";
import TripCover from "./trip-cover";
import { demoData, demoTrip } from "@/lib/demo";
import {
  emptyData,
  type Activity,
  type Expense,
  type Place,
  type Tab,
  type Task,
  type Trip,
  type TripData,
} from "@/lib/types";
import Auth from "./auth";
import Editor, { type Editable, type EditorKind } from "./editors";
import { BottomNav, Card, Empty, SectionHeading, Sheet } from "./ui";

type Modal = { kind: EditorKind | "members" | "trips"; item?: Editable };
const errorMessage = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "Something went wrong. Please try again.";
const unwrap = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export default function Planner() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(!supabase),
    [demo, setDemo] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]),
    [tripId, setTripId] = useState(""),
    [data, setData] = useState<TripData>(emptyData);
  const [tab, setTab] = useState<Tab>("overview"),
    [modal, setModal] = useState<Modal | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [day, setDay] = useState(""),
    [locationPoint, setLocationPoint] = useState<{
      latitude: number;
      longitude: number;
    } | null>(null),
    [locating, setLocating] = useState(false);
  const [demoCoverUrl, setDemoCoverUrl] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (demoCoverUrl) URL.revokeObjectURL(demoCoverUrl);
    },
    [demoCoverUrl],
  );
  const [pendingInvite, setPendingInvite] = useState("");
  const selected = useRef("");
  const tripRequest = useRef(0);
  const trip = trips.find((t) => t.id === tripId);
  const name = (id: string) =>
    data.members.find((m) => m.user_id === id)?.display_name || "Traveler";
  const amount = (cents: number) => money(cents, trip?.currency || "USD");
  const switchTrip = useCallback((id: string) => {
    if (selected.current === id) {
      setModal(null);
      return;
    }
    selected.current = id;
    setTripId(id);
    setData(emptyData);
    setDay("");
    setTab("overview");
    setModal(null);
    setError("");
  }, []);
  const loadTrips = useCallback(
    async (preferred?: string) => {
      if (!supabase) return;
      const request = ++tripRequest.current;
      const list = unwrap(
        await supabase
          .from("trips")
          .select("*")
          .order("created_at", { ascending: false }),
      ) as Trip[];
      if (request !== tripRequest.current) return;
      setTrips(list);
      const id = preferred || selected.current;
      const next = list.some((t) => t.id === id) ? id : list[0]?.id || "";
      if (next !== selected.current) switchTrip(next);
    },
    [switchTrip],
  );
  const refresh = useCallback(async (id: string) => {
    if (!supabase || !id) return;
    const results = await Promise.all([
      supabase
        .from("trip_members")
        .select("user_id, profiles!trip_members_user_id_fkey(display_name)")
        .eq("trip_id", id)
        .order("joined_at"),
      supabase
        .from("itinerary_items")
        .select("*")
        .eq("trip_id", id)
        .order("activity_date")
        .order("activity_time"),
      supabase.from("places").select("*").eq("trip_id", id).order("name"),
      supabase
        .from("expenses")
        .select("*, expense_participants(user_id)")
        .eq("trip_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("tasks").select("*").eq("trip_id", id).order("title"),
    ]);
    results.forEach(unwrap);
    if (selected.current !== id) return;
    setData({
      members: (results[0].data || []).map((m) => ({
        user_id: m.user_id,
        display_name:
          (m.profiles as unknown as { display_name: string })?.display_name ||
          "Traveler",
      })),
      activities: results[1].data as Activity[],
      places: results[2].data as Place[],
      expenses: results[3].data as Expense[],
      tasks: results[4].data as Task[],
    });
  }, []);
  useEffect(() => {
    const invite =
      new URLSearchParams(window.location.search).get("invite") ||
      sessionStorage.getItem("roam-invite") ||
      "";
    if (invite) {
      setPendingInvite(invite);
      sessionStorage.setItem("roam-invite", invite);
      history.replaceState(null, "", location.pathname);
    }
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setUser(data.session?.user || null);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
        setReady(true);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!user || demo) return;
    setLoading(true);
    loadTrips()
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [user, demo, loadTrips]);
  useEffect(() => {
    if (!tripId || demo || !user) return;
    let live = true;
    const update = () =>
      refresh(tripId).catch((e) => {
        if (live) setError(errorMessage(e));
      });
    setLoading(true);
    update().finally(() => {
      if (live) setLoading(false);
    });
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void update();
        void loadTrips().catch((e) => setError(errorMessage(e)));
      }
    }, 15000);
    const focus = () => {
      void update();
      void loadTrips().catch((e) => setError(errorMessage(e)));
    };
    window.addEventListener("focus", focus);
    const channel = supabase!.channel(`trip-${tripId}`);
    for (const table of [
      "trip_members",
      "itinerary_items",
      "places",
      "expenses",
      "expense_participants",
      "tasks",
    ])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `trip_id=eq.${tripId}` },
        () => {
          void update();
        },
      );
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "trips",
        filter: `id=eq.${tripId}`,
      },
      () => {
        void loadTrips().catch((e) => setError(errorMessage(e)));
      },
    );
    channel.subscribe();
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      void supabase!.removeChannel(channel);
    };
  }, [tripId, demo, user, refresh, loadTrips]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  function startDemo() {
    setDemoCoverUrl(null);
    setDemo(true);
    selected.current = demoTrip.id;
    setTrips([demoTrip]);
    setTripId(demoTrip.id);
    setData(structuredClone(demoData));
    setDay("");
    setError("");
  }
  async function exit() {
    try {
      if (!demo && supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      setDemo(false);
      setDemoCoverUrl(null);
      selected.current = "";
      setTripId("");
      setTrips([]);
      setData(emptyData);
      setModal(null);
      setTab("overview");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function save(form: FormData) {
    if (!modal || modal.kind === "members" || modal.kind === "trips") return;
    const text = (key: string) => String(form.get(key) || "").trim();
    const kind = modal.kind,
      item = modal.item;
    setBusy(true);
    try {
      if (kind === "trip") {
        if (
          !text("name") ||
          !text("destination") ||
          !text("start") ||
          !text("end")
        )
          throw new Error("Complete the trip name, destination and dates.");
        if (text("end") < text("start"))
          throw new Error("End date must be on or after the start date.");
        if (demo)
          throw new Error(
            "Sign in to create a shared trip. The preview is one sample trip.",
          );
        const cover = form.get("cover");
        const file = cover instanceof File && cover.size > 0 ? cover : null;
        if (file) validateCoverFile(file);
        const id = unwrap(
          await supabase!.rpc("create_trip", {
            p_name: text("name"),
            p_destination: text("destination"),
            p_start: text("start"),
            p_end: text("end"),
            p_currency: text("currency"),
          }),
        ) as string;
        // Creation succeeded. Never leave this form open for a retry that would create a duplicate trip.
        let warning = "";
        if (file) {
          try {
            const result = await saveTripCover(
              supabase!,
              { id, cover_path: null, cover_url: null },
              file,
            );
            warning = result.warning || "";
          } catch (e) {
            warning = `Trip created, but the cover was not saved: ${errorMessage(e)} Use the cover button to retry.`;
          }
        }
        setModal(null);
        try {
          await loadTrips(id);
        } catch (e) {
          warning = `Trip created. Refresh to load it: ${errorMessage(e)}`;
        }
        setToast("Trip created");
        if (warning) setError(warning);
        return;
      } else if (kind === "cover") {
        if (!trip) throw new Error("Select a trip first.");
        const entry = form.get("cover");
        const file = entry instanceof File && entry.size > 0 ? entry : null;
        if (text("remove_cover") !== "true" && !file)
          throw new Error("Choose a cover image first.");
        if (file) validateCoverFile(file);
        let warning: string | null = null;
        if (demo) {
          const url = file ? URL.createObjectURL(file) : null;
          setDemoCoverUrl(url);
          setTrips((list) =>
            list.map((t) =>
              t.id === trip.id ? { ...t, cover_url: url, cover_path: null } : t,
            ),
          );
        } else {
          try {
            const result = await saveTripCover(supabase!, trip, file);
            warning = result.warning;
            tripRequest.current++; // Do not let an older list response restore the old cover.
            setTrips((list) =>
              list.map((t) =>
                t.id === trip.id
                  ? { ...t, cover_path: result.path, cover_url: null }
                  : t,
              ),
            );
          } catch (e) {
            // Refresh the expected pointer after a conflict or ambiguous request failure.
            await loadTrips().catch(() => undefined);
            throw e;
          }
        }
        setModal(null);
        setToast(
          demo
            ? "Updated in preview"
            : file
              ? "Cover updated"
              : "Cover removed",
        );
        if (warning) setError(warning);
        return;
      } else if (kind === "join") {
        if (demo) throw new Error("Sign in to join a shared trip.");
        let code = text("code");
        if (code.includes("://")) {
          try {
            code = new URL(code).searchParams.get("invite") || "";
          } catch {
            throw new Error("Paste a valid invite link or code.");
          }
        }
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            code,
          )
        )
          throw new Error("Paste a valid invite link or code.");
        const id = unwrap(await supabase!.rpc("join_trip", { p_code: code }));
        sessionStorage.removeItem("roam-invite");
        setPendingInvite("");
        await loadTrips(id);
      } else {
        if (!trip) throw new Error("Select a trip first.");
        const id = item?.id || crypto.randomUUID();
        let table: string,
          key: "activities" | "places" | "expenses" | "tasks",
          row: Activity | Place | Expense | Task;
        if (kind === "activity") {
          if (text("date") < trip.start_date || text("date") > trip.end_date)
            throw new Error("Choose a date within this trip.");
          table = "itinerary_items";
          key = "activities";
          row = {
            id,
            trip_id: trip.id,
            title: text("title"),
            activity_date: text("date"),
            activity_time: text("time"),
            place: text("place"),
            ...mapFields(text("maps_url"), item as Activity | undefined),
            notes: text("notes"),
          };
        } else if (kind === "place") {
          table = "places";
          key = "places";
          row = {
            id,
            trip_id: trip.id,
            name: text("name"),
            ...mapFields(text("maps_url"), item as Place | undefined),
            notes: text("notes"),
          };
        } else if (kind === "expense") {
          const participants = form.getAll("participants").map(String);
          if (!participants.length)
            throw new Error("Choose at least one participant.");
          table = "expenses";
          key = "expenses";
          row = {
            id,
            trip_id: trip.id,
            description: text("description"),
            amount_cents: parseCents(text("amount")),
            payer_id: text("payer"),
            expense_participants: participants.map((user_id) => ({ user_id })),
          };
        } else {
          table = "tasks";
          key = "tasks";
          row = {
            id,
            trip_id: trip.id,
            title: text("title"),
            category: text("category") as Task["category"],
            completed: (item as Task | undefined)?.completed || false,
          };
        }
        if (("title" in row && !row.title) || ("name" in row && !row.name))
          throw new Error("Enter a name before saving.");
        if (demo)
          setData((d) => ({
            ...d,
            [key]: [...d[key].filter((v) => v.id !== id), row],
          }));
        else {
          if (kind === "expense") {
            const e = row as Expense;
            unwrap(
              await supabase!.rpc("save_expense", {
                p_trip_id: trip.id,
                p_description: e.description,
                p_amount_cents: e.amount_cents,
                p_payer: e.payer_id,
                p_participants: e.expense_participants.map((p) => p.user_id),
                p_id: item?.id || null,
              }),
            );
          } else if (item) {
            unwrap(
              await supabase!
                .from(table)
                .update(row)
                .eq("id", id)
                .eq("trip_id", trip.id)
                .select()
                .single(),
            );
          } else
            unwrap(
              await supabase!
                .from(table)
                .insert(row as unknown as Record<string, unknown>),
            );
          await refresh(trip.id);
        }
      }
      setModal(null);
      setToast(demo ? "Updated in preview" : "Saved for everyone");
    } catch (e) {
      throw new Error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(
    kind: "activities" | "places" | "expenses" | "tasks",
    id: string,
  ) {
    if (
      !trip ||
      busy ||
      !window.confirm("Delete this item for everyone on this trip?")
    )
      return;
    setBusy(true);
    try {
      if (demo)
        setData((d) => ({ ...d, [kind]: d[kind].filter((v) => v.id !== id) }));
      else {
        unwrap(
          await supabase!
            .from(kind === "activities" ? "itinerary_items" : kind)
            .delete()
            .eq("id", id)
            .eq("trip_id", trip.id),
        );
        await refresh(trip.id);
      }
      setToast("Item removed");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function toggleTask(task: Task) {
    if (busy || !trip) return;
    setBusy(true);
    try {
      if (demo)
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) =>
            t.id === task.id ? { ...t, completed: !t.completed } : t,
          ),
        }));
      else {
        unwrap(
          await supabase!
            .from("tasks")
            .update({ completed: !task.completed })
            .eq("id", task.id)
            .eq("trip_id", trip.id)
            .select()
            .single(),
        );
        await refresh(trip.id);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setError("This browser does not support location.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationPoint({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLocating(false);
        setToast("Sorted by distance from you");
      },
      (e) => {
        setError(
          e.code === 1
            ? "Location access was denied. Allow location in your browser settings to sort nearby places."
            : "Could not find your location. Please try again outdoors.",
        );
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  async function copyInvite() {
    if (!trip) return;
    try {
      if (demo)
        throw new Error("Sign in and create a trip to invite your friends.");
      await navigator.clipboard.writeText(
        `${window.location.origin}/?invite=${trip.invite_code}`,
      );
      setToast("Invite link copied");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const orderedActivities = [...data.activities].sort((a, b) =>
    `${a.activity_date}${a.activity_time}`.localeCompare(
      `${b.activity_date}${b.activity_time}`,
    ),
  );
  const days = [
    ...new Set([
      trip?.start_date || "",
      ...orderedActivities.map((a) => a.activity_date),
    ]),
  ]
    .filter(Boolean)
    .sort();
  const activeDay = day || days[0];
  const locations = nearbyLocations(
    data.places,
    data.activities,
    locationPoint,
  );
  const done = data.tasks.filter((t) => t.completed).length;
  const total = data.expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  function activityCard(a: Activity, editable = false) {
    return (
      <Card key={a.id} className="activity">
        <div className="activity-time">
          {a.activity_time.slice(0, 5)}
          <span className="timeline-dot" />
        </div>
        <div className="grow">
          <h3>{a.title}</h3>
          <p className="place-label">
            <MapPin size={12} />
            {a.place || "Place to be decided"}
          </p>
          {editable && a.notes && <p className="activity-notes">{a.notes}</p>}
          {editable && mapsLink(a, a.place) && (
            <a
              className="text-button"
              href={mapsLink(a, a.place)!}
              target="_blank"
              rel="noreferrer"
            >
              Open map <ArrowUpRight size={14} />
            </a>
          )}
        </div>
        {editable ? (
          <div className="item-actions">
            <button
              className="icon-button"
              aria-label={`Edit ${a.title}`}
              onClick={() => setModal({ kind: "activity", item: a })}
            >
              <Edit3 size={15} />
            </button>
            <button
              className="icon-button"
              disabled={busy}
              aria-label={`Delete ${a.title}`}
              onClick={() => remove("activities", a.id)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ) : (
          <ArrowUpRight className="muted" size={16} />
        )}
      </Card>
    );
  }
  if (!ready)
    return (
      <main className="phone loading">
        <LoaderCircle className="spin" />
        <p>Finding your next adventure…</p>
      </main>
    );
  if (!user && !demo) return <Auth onDemo={startDemo} />;
  return (
    <main className="phone">
      {demo && (
        <div className="demo-banner">
          <span>Sample trip · changes aren’t saved</span>
          <button onClick={exit}>
            Sign in <ArrowRight size={12} />
          </button>
        </div>
      )}
      <header className="app-header">
        <button
          className="trip-switch"
          onClick={() => setModal({ kind: "trips" })}
        >
          <span className="logo-icon">
            <Compass size={23} strokeWidth={1.5} />
          </span>
          <span>
            <span className="eyebrow">YOUR SHARED LITTLE WORLD</span>
            <strong>
              {trip?.destination || "Let’s go somewhere"}
              <ChevronDown size={14} />
            </strong>
          </span>
        </button>
        <button
          className="avatar me"
          aria-label="Trip members"
          onClick={() => setModal({ kind: "members" })}
        >
          {(demo
            ? "Alex"
            : user?.user_metadata.display_name || user?.email || "You"
          )
            .slice(0, 1)
            .toUpperCase()}
        </button>
      </header>
      <div className="main-content">
        {pendingInvite && !demo && (
          <Card className="invite-banner">
            <p>You have a trip invitation.</p>
            <button
              className="text-button"
              onClick={() => setModal({ kind: "join" })}
            >
              Join your friends <ArrowRight size={14} />
            </button>
            <small className="invite-code">{pendingInvite}</small>
          </Card>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button
              className="text-button"
              onClick={() => {
                setError("");
                if (!demo) {
                  void loadTrips().catch((e) => setError(errorMessage(e)));
                  if (tripId)
                    void refresh(tripId).catch((e) =>
                      setError(errorMessage(e)),
                    );
                }
              }}
            >
              Retry <RefreshCw size={12} />
            </button>
          </div>
        )}
        {loading && (
          <p className="sync-status" role="status">
            <LoaderCircle size={12} className="spin" /> Updating your trip…
          </p>
        )}
        {!trip ? (
          <div className="welcome">
            <span className="eyebrow blue">ROOM FOR NEW MEMORIES</span>
            <h1>
              Your next chapter
              <br />
              starts here.
            </h1>
            <p className="muted">
              Make a plan. Bring your people.
              <br />
              Leave a little room for the unexpected.
            </p>
            <Card className="welcome-card">
              <Compass size={42} />
              <h2>Where are we going?</h2>
              <p>Create a trip and plan it together.</p>
              <button
                className="button primary"
                onClick={() => setModal({ kind: "trip" })}
              >
                <Plus size={18} /> Create a trip
              </button>
              <button
                className="button secondary"
                onClick={() => setModal({ kind: "join" })}
              >
                Join with an invite
              </button>
            </Card>
          </div>
        ) : (
          <div key={tab} className="tab-content">
            {tab === "overview" && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">THE BEST PLANS ARE SHARED</span>
                    <h1>
                      Away, together<span className="blue">.</span>
                    </h1>
                  </div>
                  <Sparkles size={21} className="soft-purple" />
                </div>
                <section className="trip-hero">
                  <TripCover key={trip.id} trip={trip} demo={demo} />
                  <div className="hero-top">
                    <span className="glass-pill">
                      <span className="live-dot" /> Your next adventure
                    </span>
                    <div className="hero-actions">
                      <button
                        className="hero-icon"
                        aria-label="Change trip cover"
                        onClick={() => setModal({ kind: "cover" })}
                      >
                        <Camera size={17} />
                      </button>
                      <button
                        className="hero-icon"
                        aria-label="Invite friends"
                        onClick={() => setModal({ kind: "members" })}
                      >
                        <Users size={17} />
                      </button>
                    </div>
                  </div>
                  <div className="hero-bottom">
                    <span className="eyebrow">{trip.destination}</span>
                    <h2>{trip.name}</h2>
                    <div className="hero-meta">
                      <span>
                        <CalendarDays size={14} />
                        {dateLabel(trip.start_date)} —{" "}
                        {dateLabel(trip.end_date)}
                      </span>
                      <button
                        className="avatar-stack"
                        aria-label="View members"
                        onClick={() => setModal({ kind: "members" })}
                      >
                        {data.members.slice(0, 3).map((m, i) => (
                          <span key={m.user_id} className={`avatar tone-${i}`}>
                            {m.display_name[0]}
                          </span>
                        ))}
                        <span className="crew-count">
                          {data.members.length}
                        </span>
                      </button>
                    </div>
                  </div>
                </section>
                <div className="quick-actions">
                  {[
                    {
                      label: "Itinerary",
                      icon: CalendarDays,
                      to: "itinerary",
                      count: `${data.activities.length} plans`,
                    },
                    {
                      label: "Saved places",
                      icon: MapPin,
                      to: "places",
                      count: `${data.places.length} to explore`,
                    },
                    {
                      label: "Expenses",
                      icon: Wallet,
                      to: "expenses",
                      count: amount(total),
                    },
                  ].map(({ label, icon: Icon, to, count }) => (
                    <button key={to} onClick={() => setTab(to as Tab)}>
                      <span
                        className={`quick-icon ${to === "itinerary" ? "selected" : ""}`}
                      >
                        <Icon size={21} strokeWidth={1.5} />
                      </span>
                      <strong>{label}</strong>
                      <small>{count}</small>
                    </button>
                  ))}
                </div>
                <SectionHeading
                  title="A little look ahead"
                  action="View plan"
                  onClick={() => setTab("itinerary")}
                />
                <p className="day-caption">
                  {dateLabel(
                    orderedActivities[0]?.activity_date || trip.start_date,
                    { weekday: "long", month: "short", day: "numeric" },
                  )}
                  <span>LET’S MAKE A DAY OF IT</span>
                </p>
                <div className="stack">
                  {orderedActivities.slice(0, 2).map((a) => activityCard(a))}
                  {!data.activities.length && (
                    <Empty
                      title="Leave room for adventure"
                      onAdd={() => setModal({ kind: "activity" })}
                    >
                      Start with one thing you’d love to do.
                    </Empty>
                  )}
                </div>
                <button
                  className="packing-teaser glass"
                  onClick={() => setTab("checklist")}
                >
                  <span className="quick-icon lavender">
                    <ListChecks size={22} />
                  </span>
                  <div>
                    <h3>A little prep, a lot of peace</h3>
                    <p>
                      {done} of {data.tasks.length} things checked off
                    </p>
                  </div>
                  <ArrowUpRight size={17} />
                </button>
                <p className="footer-note">LESS LOGISTICS. MORE MEMORIES.</p>
              </>
            )}
            {tab === "itinerary" && (
              <>
                <PageTitle
                  eyebrow="ONE DAY AT A TIME"
                  title="The shared plan"
                  subtitle="A little structure. A little spontaneity."
                  onAdd={() => setModal({ kind: "activity" })}
                />
                <div className="date-strip">
                  {days.map((d) => (
                    <button
                      key={d}
                      className={activeDay === d ? "selected" : ""}
                      onClick={() => setDay(d)}
                    >
                      <span>{dateLabel(d, { weekday: "short" })}</span>
                      <strong>{dateLabel(d, { day: "numeric" })}</strong>
                      <small>{dateLabel(d, { month: "short" })}</small>
                    </button>
                  ))}
                  <button
                    className="add-day"
                    onClick={() => setModal({ kind: "activity" })}
                  >
                    <Plus size={20} />
                    <small>Add plan</small>
                  </button>
                </div>
                <SectionHeading
                  title={dateLabel(activeDay || trip.start_date, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                />
                <div className="stack">
                  {orderedActivities
                    .filter((a) => a.activity_date === activeDay)
                    .map((a) => activityCard(a, true))}
                  {!orderedActivities.some(
                    (a) => a.activity_date === activeDay,
                  ) && (
                    <Empty
                      title="A beautifully open day"
                      onAdd={() => setModal({ kind: "activity" })}
                    >
                      Add an activity and build the day together.
                    </Empty>
                  )}
                </div>
              </>
            )}
            {tab === "places" && (
              <>
                <PageTitle
                  eyebrow="THE PLACES ON YOUR LIST"
                  title="Worth the detour"
                  subtitle="Save a spot. Find your way back to it."
                  onAdd={() => setModal({ kind: "place" })}
                />
                <button
                  className={`button location-button ${locationPoint ? "located" : ""}`}
                  disabled={locating}
                  onClick={locate}
                >
                  {locating ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Navigation size={17} />
                  )}{" "}
                  {locating
                    ? "Finding you…"
                    : locationPoint
                      ? "Nearest first · refresh location"
                      : "Find places near me"}
                </button>
                <p className="muted small">
                  Saved places and plan locations · Your location stays in this
                  browser.
                </p>
                <div className="stack">
                  {locations.map((entry, i) => {
                    const p = entry.item;
                    const link = mapsLink(p, entry.name);
                    return (
                      <Card key={entry.key} className="place-card">
                        <div className="place-card-top">
                          <span className="place-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {entry.kind === "activity" ? (
                            <CalendarDays size={25} className="soft-purple" />
                          ) : (
                            <MapPin size={25} className="soft-purple" />
                          )}
                          {locationPoint && (
                            <span className="distance">
                              {entry.distance === null
                                ? "Distance unavailable"
                                : `${entry.distance.toFixed(1)} km away`}
                            </span>
                          )}
                        </div>
                        <h2>{entry.name}</h2>
                        <span className="muted small">
                          {entry.kind === "activity"
                            ? `Plan · ${(p as Activity).title}`
                            : "Saved place"}
                        </span>
                        <p>
                          {p.notes || "A new spot for your shared adventure."}
                        </p>
                        <div className="place-card-footer">
                          {link && (
                            <a
                              className="text-button"
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open map <ArrowUpRight size={14} />
                            </a>
                          )}
                          <div className="item-actions">
                            <button
                              className="icon-button"
                              aria-label={`Edit ${entry.name}`}
                              onClick={() =>
                                setModal({ kind: entry.kind, item: p })
                              }
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={busy}
                              aria-label={`Delete ${entry.name}`}
                              onClick={() =>
                                remove(
                                  entry.kind === "activity"
                                    ? "activities"
                                    : "places",
                                  p.id,
                                )
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  {!locations.length && (
                    <Empty
                      title="Your someday spots"
                      onAdd={() => setModal({ kind: "place" })}
                    >
                      Save a Maps link in Places or your plan to see what’s
                      nearby.
                    </Empty>
                  )}
                </div>
              </>
            )}
            {tab === "expenses" && (
              <>
                <PageTitle
                  eyebrow="GOOD COMPANY. FAIR SHARES."
                  title="Keep it even"
                  subtitle="Enjoy the moment. We’ll do the math."
                  onAdd={() => setModal({ kind: "expense" })}
                />
                <Card className="expense-summary">
                  <span className="eyebrow">TOTAL TRIP SPEND</span>
                  <h2>{amount(total)}</h2>
                  <span className="muted small">
                    {data.expenses.length} expenses · {trip.currency} · split
                    with your crew
                  </span>
                </Card>
                <SectionHeading title="Settle up" />
                <Card className="settlements">
                  {settlements(data.expenses).map((s, i) => (
                    <div className="settlement" key={i}>
                      <span className="avatar">{name(s.from)[0]}</span>
                      <div className="grow">
                        <strong>
                          {name(s.from)} <ArrowRight size={12} /> {name(s.to)}
                        </strong>
                        <small>Suggested payment</small>
                      </div>
                      <strong className="blue">{amount(s.amount)}</strong>
                    </div>
                  ))}
                  {!settlements(data.expenses).length && (
                    <p className="all-even">
                      <Check size={18} /> Everyone’s even. Good feeling, right?
                    </p>
                  )}
                  <p className="muted small">
                    Suggested transfers only; no money is moved or payments
                    recorded.
                  </p>
                </Card>
                <details className="balance-details">
                  <summary>Individual balances</summary>
                  {data.members.map((m) => (
                    <div className="balance-row" key={m.user_id}>
                      <span>{m.display_name}</span>
                      <span>
                        {amount(balances(data.expenses)[m.user_id] || 0)}
                      </span>
                    </div>
                  ))}
                  <p className="small muted">
                    Positive = gets back · Negative = owes
                  </p>
                </details>
                <SectionHeading title="The little things add up" />
                <div className="stack">
                  {data.expenses.map((e) => (
                    <Card key={e.id} className="expense-row">
                      <span className="expense-icon">
                        <Wallet size={19} />
                      </span>
                      <div className="grow">
                        <h3>{e.description}</h3>
                        <p>
                          {name(e.payer_id)} paid ·{" "}
                          {e.expense_participants.length} people
                        </p>
                        <div className="item-actions">
                          <button
                            className="text-button"
                            onClick={() =>
                              setModal({ kind: "expense", item: e })
                            }
                          >
                            Edit
                          </button>
                          <button
                            className="text-button danger"
                            disabled={busy}
                            aria-label={`Delete ${e.description}`}
                            onClick={() => remove("expenses", e.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <strong>{amount(e.amount_cents)}</strong>
                    </Card>
                  ))}
                  {!data.expenses.length && (
                    <Empty
                      title="Start with the first shared bill"
                      onAdd={() => setModal({ kind: "expense" })}
                    >
                      Pick who paid and who’s splitting it.
                    </Empty>
                  )}
                </div>
              </>
            )}
            {tab === "checklist" && (
              <>
                <PageTitle
                  eyebrow="READY FOR THE GOOD PART"
                  title="Before you go"
                  subtitle="A lighter mind. A well-packed bag."
                  onAdd={() => setModal({ kind: "task" })}
                />
                <Card className="progress-card">
                  <div>
                    <span>
                      {done} of {data.tasks.length} ready
                    </span>
                    <span>
                      {data.tasks.length
                        ? Math.round((done / data.tasks.length) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                  <progress max={data.tasks.length || 1} value={done} />
                  <p>Little by little, you’re getting there.</p>
                </Card>
                {(["packing", "task"] as const).map((category) => (
                  <section key={category}>
                    <SectionHeading
                      title={
                        category === "packing"
                          ? "In the bag"
                          : "On the to-do list"
                      }
                    />
                    <div className="stack">
                      {data.tasks
                        .filter((t) => t.category === category)
                        .map((t) => (
                          <Card
                            key={t.id}
                            className={`task-row ${t.completed ? "completed" : ""}`}
                          >
                            <button
                              className="task-toggle"
                              role="checkbox"
                              aria-checked={t.completed}
                              aria-label={t.title}
                              disabled={busy}
                              onClick={() => toggleTask(t)}
                            >
                              <span className="checkbox">
                                {t.completed && <Check size={14} />}
                              </span>
                              <span>{t.title}</span>
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Edit ${t.title}`}
                              onClick={() =>
                                setModal({ kind: "task", item: t })
                              }
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={busy}
                              aria-label={`Delete ${t.title}`}
                              onClick={() => remove("tasks", t.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </Card>
                        ))}
                      {!data.tasks.some((t) => t.category === category) && (
                        <p className="muted small">
                          Nothing here yet. Add something with the + above.
                        </p>
                      )}
                    </div>
                  </section>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      {trip && <BottomNav tab={tab} onChange={setTab} />}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {modal && (
        <Sheet
          title={
            modal.kind === "members"
              ? "Your travel crew"
              : modal.kind === "trips"
                ? "Your trips"
                : modal.kind === "trip"
                  ? "Somewhere new"
                  : modal.kind === "join"
                    ? "Join the adventure"
                    : modal.kind === "cover"
                      ? "Trip cover"
                      : `${modal.item ? "Edit" : "Add"} ${modal.kind === "task" ? "checklist item" : modal.kind}`
          }
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          {modal.kind === "trips" ? (
            <div className="stack">
              {trips.map((t) => (
                <button
                  key={t.id}
                  className={`trip-option glass ${t.id === tripId ? "current" : ""}`}
                  onClick={() => {
                    if (demo) setModal(null);
                    else switchTrip(t.id);
                  }}
                >
                  <span className="quick-icon">
                    <Compass size={23} />
                  </span>
                  <span className="grow">
                    <strong>{t.name}</strong>
                    <small>
                      {t.destination} · {dateLabel(t.start_date)}
                    </small>
                  </span>
                  {t.id === tripId && <Check size={18} />}
                </button>
              ))}
              <button
                className="button primary"
                onClick={() => setModal({ kind: "trip" })}
              >
                <Plus size={18} /> Create a trip
              </button>
              <button
                className="button secondary"
                onClick={() => setModal({ kind: "join" })}
              >
                Join with an invite
              </button>
              <button className="button quiet" onClick={exit}>
                <LogOut size={17} />
                {demo ? "Leave preview & sign in" : "Log out"}
              </button>
            </div>
          ) : modal.kind === "members" ? (
            <div className="stack">
              <p className="muted">The best part of the trip? The people.</p>
              {data.members.map((m, i) => (
                <Card className="member-row" key={m.user_id}>
                  <span className={`avatar tone-${i % 3}`}>
                    {m.display_name[0]}
                  </span>
                  <div>
                    <h3>{m.display_name}</h3>
                    <p>
                      {m.user_id === trip?.owner_id
                        ? "Trip creator"
                        : "Travel crew"}
                    </p>
                  </div>
                </Card>
              ))}
              {trip && (
                <>
                  <button className="button primary" onClick={copyInvite}>
                    <Copy size={16} /> Copy invite link
                  </button>
                  <p className="muted small">
                    Anyone with this link can sign in and join your trip. Share
                    it with your crew.
                  </p>
                  {!demo && (
                    <input
                      aria-label="Invite link"
                      readOnly
                      value={
                        typeof window !== "undefined"
                          ? `${window.location.origin}/?invite=${trip.invite_code}`
                          : ""
                      }
                    />
                  )}
                  <p className="small error" role="status">
                    {error}
                  </p>
                  {!demo && user?.id === trip.owner_id && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !confirm(
                            "Replace the invite? The old link will stop working.",
                          )
                        )
                          return;
                        setBusy(true);
                        try {
                          unwrap(
                            await supabase!.rpc("rotate_invite", {
                              p_trip_id: trip.id,
                            }),
                          );
                          await loadTrips();
                          setToast("New invite ready");
                        } catch (e) {
                          setError(errorMessage(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <RefreshCw size={14} /> Replace invite link
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <Editor
              key={`${modal.kind}-${modal.item?.id || "new"}`}
              kind={modal.kind}
              invite={pendingInvite}
              item={modal.item}
              trip={trip}
              members={data.members}
              onSave={save}
              busy={busy}
            />
          )}
        </Sheet>
      )}
    </main>
  );
}
function PageTitle({
  eyebrow,
  title,
  subtitle,
  onAdd,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  onAdd: () => void;
}) {
  return (
    <div className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <div>
        <h1>
          {title}
          <span className="blue">.</span>
        </h1>
        <button className="add-button" aria-label="Add item" onClick={onAdd}>
          <Plus size={22} />
        </button>
      </div>
      <p>{subtitle}</p>
    </div>
  );
}
