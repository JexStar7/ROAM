"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, Compass, Users, MapPin, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Field, Landscape } from "./ui";
export default function Auth({ onDemo }: { onDemo: () => void }) {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim(),
      password = String(form.get("password"));
    try {
      const result = signup
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { display_name: String(form.get("name")).trim() },
              emailRedirectTo: location.origin,
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setMessage(
          "Check your email to confirm your account, then come back to sign in.",
        );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to sign in. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="phone auth">
      <header className="brand">
        <Compass size={25} />
        <span>
          roam<span className="brand-dot">.</span>
        </span>
        <span className="eyebrow">GO TOGETHER</span>
      </header>
      <div className="auth-art">
        <Landscape />
        <div className="art-pill">
          <Users size={14} /> Good trips start with good company
        </div>
      </div>
      <div className="auth-body">
        <span className="eyebrow blue">
          A LITTLE LESS PLANNING. A LOT MORE LIVING.
        </span>
        <h1>
          Somewhere new.
          <br />
          <span>Together.</span>
        </h1>
        <p>
          Your people, your plans, your next great story.
          <br />
          Keep it all in one happy place.
        </p>
        <div className="auth-features">
          <span>
            <MapPin size={15} /> Shared plans
          </span>
          <span>
            <Wallet size={15} /> Easy splits
          </span>
          <span>
            <Users size={15} /> Your crew
          </span>
        </div>
        <form onSubmit={submit} className="form">
          <div className="segmented">
            <button
              type="button"
              className={!signup ? "selected" : ""}
              onClick={() => {
                setSignup(false);
                setError("");
              }}
            >
              Log in
            </button>
            <button
              type="button"
              className={signup ? "selected" : ""}
              onClick={() => {
                setSignup(true);
                setError("");
              }}
            >
              Sign up
            </button>
          </div>
          {signup && (
            <Field label="Your name">
              <input
                name="name"
                required
                maxLength={80}
                autoComplete="name"
                placeholder="What should we call you?"
              />
            </Field>
          )}
          <Field label="Email address">
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder="At least 8 characters"
            />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          <button className="button primary" disabled={busy || !supabase}>
            {busy ? "One moment…" : signup ? "Create your account" : "Let’s go"}
            <ArrowRight size={18} />
          </button>
        </form>
        {!supabase && (
          <p className="setup-note">
            Preview is ready. Connect Supabase using <code>.env.local</code> to
            enable accounts and shared trips.
          </p>
        )}
        <button className="preview-link" onClick={onDemo}>
          Take a look around <ArrowRight size={15} />
        </button>
      </div>
    </main>
  );
}
