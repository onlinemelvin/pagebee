export interface Appt {
  id: string;
  serviceName: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: string;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
}

export interface ApptService {
  name: string;
  durationMinutes: number;
}

export const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-green-100 text-green-800",
  RESCHEDULED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-teal-100 text-teal-800",
  CANCELLED: "bg-stone-200 text-stone-600",
  NO_SHOW: "bg-red-100 text-red-700",
};

/** Local yyyy-mm-dd for an ISO timestamp (calendar grouping uses the viewer's local day). */
export function localYmd(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
