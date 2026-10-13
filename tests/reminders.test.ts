import { describe, expect, it } from "vitest";
import { InMemoryActivityRepository } from "../src/activities/repository.js";
import { ActivityService } from "../src/activities/service.js";
import { InMemoryReminderRepository } from "../src/reminders/repository.js";
import { nextOccurrence, ReminderService } from "../src/reminders/service.js";

describe("reminders and recurrence", () => {
  it("schedules, finds due, and snoozes a reminder", async () => {
    const activityRepository = new InMemoryActivityRepository();
    const activity = await new ActivityService(activityRepository).create("owner-1", {
      type: "call",
      title: "Call customer",
    });
    const reminderRepository = new InMemoryReminderRepository();
    const service = new ReminderService(
      activityRepository,
      reminderRepository,
      () => new Date("2026-10-10T10:00:00.000Z"),
    );
    const reminder = await service.schedule("owner-1", activity.id, {
      remindAt: "2026-10-10T09:00:00.000Z",
    });

    expect(await service.due("owner-1")).toHaveLength(1);
    const snoozed = await service.snooze("owner-1", reminder.id, "2026-10-10T11:00:00.000Z");
    expect(snoozed.remindAt).toBe("2026-10-10T11:00:00.000Z");
    expect(await service.due("owner-1")).toHaveLength(0);
  });

  it("calculates recurring dates", () => {
    const start = new Date("2026-10-10T10:00:00.000Z");
    expect(nextOccurrence(start, { frequency: "daily" }).toISOString()).toBe("2026-10-11T10:00:00.000Z");
    expect(nextOccurrence(start, { frequency: "weekly" }).toISOString()).toBe("2026-10-17T10:00:00.000Z");
    expect(nextOccurrence(start, { frequency: "monthly" }).toISOString()).toBe("2026-11-10T10:00:00.000Z");
  });

  it("builds a daily briefing", async () => {
    const activityRepository = new InMemoryActivityRepository();
    const activityService = new ActivityService(activityRepository);
    await activityService.create("owner-1", {
      type: "task",
      title: "Overdue task",
      scheduledFor: "2026-10-09T10:00:00.000Z",
    });
    await activityService.create("owner-1", {
      type: "meeting",
      title: "Today meeting",
      scheduledFor: "2026-10-10T12:00:00.000Z",
    });
    const reminderService = new ReminderService(
      activityRepository,
      new InMemoryReminderRepository(),
      () => new Date("2026-10-10T10:00:00.000Z"),
    );

    const briefing = await reminderService.briefing("owner-1");
    expect(briefing.overdue).toHaveLength(1);
    expect(briefing.today).toHaveLength(1);
    expect(briefing.nextActivity?.title).toBe("Today meeting");
  });
});
