import type { ActivityType } from "../activities/types.js";
import { zonedLocalToUtc } from "./time.js";

export interface ParsedActivity {
  type: ActivityType;
  title: string;
  scheduledFor?: string;
}

const typePatterns: Array<[ActivityType, RegExp]> = [
  ["meeting", /\bmeeting\b/i],
  ["call", /\b(call|phone)\b/i],
  ["follow-up", /\b(follow[\s-]?up|followup)\b/i],
  ["task", /\b(task|remind(?:er)?|todo|to-do)\b/i],
];

function activityType(text: string): ActivityType {
  return typePatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? "task";
}

function scheduledDate(text: string, now: Date, timeZone: string): string | undefined {
  const current = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const currentParts = Object.fromEntries(
    current.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  );
  const date = new Date(Date.UTC(currentParts.year, currentParts.month - 1, currentParts.day));
  if (/\btomorrow\b/i.test(text)) date.setUTCDate(date.getUTCDate() + 1);
  else if (!/\btoday\b/i.test(text)) return undefined;

  let hours = 9;
  let minutes = 0;
  const time = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (time) {
    hours = Number(time[1]) % 12;
    if (time[3].toLowerCase() === "pm") hours += 12;
    minutes = Number(time[2] ?? 0);
  }
  return zonedLocalToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hours, minutes, timeZone).toISOString();
}

export function parseActivityText(text: string, now = new Date(), timeZone = "Asia/Kolkata"): ParsedActivity {
  const title = text
    .replace(/^\s*\/add\s*/i, "")
    .replace(/\b(today|tomorrow)\b/gi, "")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi, "")
    .replace(/^\s*at\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) throw new Error("Please describe the activity after /add.");
  return { type: activityType(text), title, scheduledFor: scheduledDate(text, now, timeZone) };
}
