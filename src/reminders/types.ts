import type { Activity } from "../activities/types.js";

export const reminderOffsets = [5, 15, 30, 60, 120, 1440] as const;
export type ReminderOffsetMinutes = (typeof reminderOffsets)[number];

export type Recurrence =
  | { frequency: "daily"; interval?: number }
  | { frequency: "weekly"; interval?: number; weekdays?: number[] }
  | { frequency: "monthly"; interval?: number };

export interface Reminder {
  id: string;
  ownerId: string;
  activityId: string;
  remindAt: string;
  status: "scheduled" | "sent" | "cancelled";
  snoozedUntil?: string;
  createdAt: string;
}

export interface Briefing {
  overdue: Activity[];
  today: Activity[];
  upcoming: Activity[];
  nextActivity?: Activity;
}
