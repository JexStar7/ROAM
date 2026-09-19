"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { COVER_BUCKET, tripCoverPath } from "@/lib/covers";
import type { Trip } from "@/lib/types";
import { Landscape } from "./ui";

export default function TripCover({
  trip,
  demo,
}: {
  trip: Trip;
  demo: boolean;
}) {
  const path = tripCoverPath(trip);
  const [image, setImage] = useState<{ path: string; url: string } | null>(
    null,
  );
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (demo || !path || !supabase) return;
    let active = true;
    const refresh = async () => {
      try {
        const { data, error } = await supabase!.storage
          .from(COVER_BUCKET)
          .createSignedUrl(path, 3600);
        if (!active) return;
        if (error) {
          setFailed(path);
          return;
        }
        setImage({ path, url: data.signedUrl });
        setFailed(null);
      } catch {
        if (active) setFailed(path);
      }
    };
    void refresh();
    const timer = setInterval(
      () => {
        void refresh();
      },
      45 * 60 * 1000,
    );
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [demo, path]);
  const url =
    demo && trip.cover_url?.startsWith("blob:")
      ? trip.cover_url
      : image?.path === path && failed !== path
        ? image?.url
        : null;
  return (
    <>
      <Landscape />
      {url && (
        <img
          className="trip-cover"
          src={url}
          alt=""
          onError={() => {
            setImage(null);
            if (path) setFailed(path);
          }}
        />
      )}
    </>
  );
}
