import type { Trip, TripData } from "./types";
export const demoTrip: Trip = {
  id: "demo",
  name: "A little escape to Bali",
  destination: "Bali, Indonesia",
  start_date: "2026-10-12",
  end_date: "2026-10-17",
  currency: "USD",
  owner_id: "alex",
  invite_code: "demo",
};
export const demoData: TripData = {
  members: [
    { user_id: "alex", display_name: "Alex" },
    { user_id: "sam", display_name: "Sam" },
    { user_id: "jules", display_name: "Jules" },
  ],
  activities: [
    {
      id: "a1",
      trip_id: "demo",
      title: "A slow morning in Ubud",
      activity_date: "2026-10-12",
      activity_time: "09:00",
      place: "Ubud, Bali",
      notes: "Coffee first. Then see where the little streets take us.",
    },
    {
      id: "a2",
      trip_id: "demo",
      title: "Walk the rice terraces",
      activity_date: "2026-10-12",
      activity_time: "11:30",
      place: "Tegallalang",
      notes: "Bring water and a camera.",
    },
    {
      id: "a3",
      trip_id: "demo",
      title: "Chase the sunset",
      activity_date: "2026-10-12",
      activity_time: "17:30",
      place: "Campuhan Ridge",
      notes: "Our first sunset together.",
    },
  ],
  places: [
    {
      id: "p1",
      trip_id: "demo",
      name: "Tegallalang Rice Terrace",
      latitude: -8.4312,
      longitude: 115.2793,
      notes: "Green as far as you can see.",
    },
    {
      id: "p2",
      trip_id: "demo",
      name: "Campuhan Ridge Walk",
      latitude: -8.4995,
      longitude: 115.2537,
      notes: "Best just before sunset.",
    },
  ],
  expenses: [
    {
      id: "e1",
      trip_id: "demo",
      description: "Airport ride",
      amount_cents: 3600,
      payer_id: "alex",
      expense_participants: [
        { user_id: "alex" },
        { user_id: "sam" },
        { user_id: "jules" },
      ],
    },
  ],
  tasks: [
    {
      id: "t1",
      trip_id: "demo",
      title: "Passport & travel documents",
      category: "packing",
      completed: true,
    },
    {
      id: "t2",
      trip_id: "demo",
      title: "Sunscreen",
      category: "packing",
      completed: false,
    },
    {
      id: "t3",
      trip_id: "demo",
      title: "Download offline maps",
      category: "task",
      completed: false,
    },
  ],
};
