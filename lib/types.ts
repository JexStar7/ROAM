export type Trip = {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  currency: string;
  owner_id: string;
  invite_code: string;
  cover_path?: string | null;
  cover_url?: string | null;
};
export type Member = { user_id: string; display_name: string };
export type Activity = {
  id: string;
  trip_id: string;
  title: string;
  activity_date: string;
  activity_time: string;
  place: string;
  notes: string;
  maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
export type Place = {
  id: string;
  trip_id: string;
  name: string;
  notes: string;
  maps_url?: string | null;
  latitude: number | null;
  longitude: number | null;
};
export type Expense = {
  id: string;
  trip_id: string;
  description: string;
  amount_cents: number;
  payer_id: string;
  expense_participants: { user_id: string }[];
};
export type Task = {
  id: string;
  trip_id: string;
  title: string;
  category: "packing" | "task";
  completed: boolean;
};
export type TripData = {
  members: Member[];
  activities: Activity[];
  places: Place[];
  expenses: Expense[];
  tasks: Task[];
};
export type Tab =
  "overview" | "itinerary" | "places" | "expenses" | "checklist";
export const emptyData: TripData = {
  members: [],
  activities: [],
  places: [],
  expenses: [],
  tasks: [],
};
