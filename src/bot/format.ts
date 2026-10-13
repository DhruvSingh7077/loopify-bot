import type { Activity } from "../activities/types.js";
import { formatInTimeZone } from "./time.js";

export function formatActivity(activity: Activity, timeZone = "Asia/Kolkata"): string {
  const schedule = activity.scheduledFor
    ? `\nWhen: ${formatInTimeZone(activity.scheduledFor, timeZone)}`
    : "";
  return `${activity.type.toUpperCase()}: ${activity.title}\nPriority: ${activity.priority}\nStatus: ${activity.status}${schedule}`;
}

export function formatActivityList(title: string, activities: Activity[], timeZone = "Asia/Kolkata"): string {
  if (!activities.length) return `${title}\n\nNo activities found.`;
  return `${title}\n\n${activities.map((activity, index) => `${index + 1}. ${formatActivity(activity, timeZone)}`).join("\n\n")}`;
}
