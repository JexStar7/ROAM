"use client";
import { useEffect, useRef, type ReactNode } from "react";
import {
  X,
  Plus,
  Compass,
  CalendarDays,
  MapPin,
  Wallet,
  ListChecks,
  ArrowUpRight,
} from "lucide-react";
import type { Tab } from "@/lib/types";
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`glass ${className}`}>{children}</div>;
}
export function Empty({
  title,
  children,
  onAdd,
}: {
  title: string;
  children: ReactNode;
  onAdd?: () => void;
}) {
  return (
    <Card className="empty">
      <div className="empty-icon">
        <Compass size={25} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {onAdd && (
        <button className="button secondary" onClick={onAdd}>
          <Plus size={16} /> Add your first one
        </button>
      )}
    </Card>
  );
}
export function SectionHeading({
  title,
  action,
  onClick,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {action && (
        <button className="text-button" onClick={onClick}>
          {action}
          <ArrowUpRight size={14} />
        </button>
      )}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-handle" />
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (tab: Tab) => void;
}) {
  const tabs = [
    { id: "overview", label: "Trip", icon: Compass },
    { id: "itinerary", label: "Plan", icon: CalendarDays },
    { id: "places", label: "Places", icon: MapPin },
    { id: "expenses", label: "Split", icon: Wallet },
    { id: "checklist", label: "Pack", icon: ListChecks },
  ] as const;
  return (
    <nav className="bottom-nav" aria-label="Trip navigation">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={tab === id ? "active" : ""}
          aria-label={label}
          aria-current={tab === id ? "page" : undefined}
        >
          <Icon size={21} strokeWidth={1.6} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
export function Landscape() {
  return (
    <svg
      className="landscape"
      viewBox="0 0 600 420"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sky" x2="0" y2="1">
          <stop stopColor="#343d6a" />
          <stop offset=".6" stopColor="#657480" />
          <stop offset="1" stopColor="#b6a398" />
        </linearGradient>
        <linearGradient id="ridge" x2="0" y2="1">
          <stop stopColor="#566e76" />
          <stop offset="1" stopColor="#233b40" />
        </linearGradient>
        <linearGradient id="front" x2="0" y2="1">
          <stop stopColor="#283f42" />
          <stop offset="1" stopColor="#12292e" />
        </linearGradient>
        <filter id="haze">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <path fill="url(#sky)" d="M0 0h600v420H0z" />
      <circle cx="431" cy="87" r="28" fill="#eadbd2" opacity=".5" />
      <path
        d="M-30 278 161 100 277 238 354 165 653 345v100H-30"
        fill="#495568"
      />
      <path d="m85 182 76-82 82 99-80-35z" fill="#869093" opacity=".36" />
      <path d="M-30 304Q126 168 254 253T636 254v220H-30" fill="url(#ridge)" />
      <path
        d="M-30 316Q135 258 286 312T630 287"
        stroke="#adb0a5"
        strokeWidth="31"
        filter="url(#haze)"
        opacity=".22"
      />
      <path d="M-30 407Q147 250 284 355T649 327v110H-30" fill="url(#front)" />
      <g fill="none" stroke="#9ba68b" opacity=".16" strokeWidth="2">
        <path d="M-20 377q160-121 314-15t322-7" />
        <path d="M-20 391q160-121 314-15t322-7" />
        <path d="M-20 405q160-121 314-15t322-7" />
      </g>
    </svg>
  );
}
