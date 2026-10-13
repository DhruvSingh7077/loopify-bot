import { describe, expect, it } from "vitest";
import { parseActivityText } from "../src/bot/parser.js";

describe("Telegram bot Stage 4A parser", () => {
  const now = new Date("2026-10-10T08:00:00.000Z");

  it("parses a call scheduled for tomorrow", () => {
    expect(parseActivityText("Tomorrow at 11 AM call Kiran about CNC", now)).toEqual({
      type: "call",
      title: "call Kiran about CNC",
      scheduledFor: "2026-10-11T05:30:00.000Z",
    });
  });

  it("defaults unclassified text to a task", () => {
    expect(parseActivityText("/add review the quotation", now).type).toBe("task");
  });
});
