import { describe, expect, it } from "vitest";
import { InMemoryActivityRepository } from "../src/activities/repository.js";
import { ActivityService } from "../src/activities/service.js";
import { InMemoryReminderRepository } from "../src/reminders/repository.js";
import { ReminderService } from "../src/reminders/service.js";
import { ReminderWorker } from "../src/reminders/worker.js";

describe("reminder worker", () => {
  it("sends a due notification once and marks it sent", async () => {
    const activitiesRepository = new InMemoryActivityRepository();
    const activity = await new ActivityService(activitiesRepository).create("1380335807", {
      type: "meeting",
      title: "Test meeting",
      scheduledFor: "2026-10-10T10:00:00.000Z",
    });
    const remindersRepository = new InMemoryReminderRepository();
    const reminders = new ReminderService(
      activitiesRepository,
      remindersRepository,
      () => new Date("2026-10-10T09:50:00.000Z"),
    );
    await reminders.schedule("1380335807", activity.id, { remindAt: "2026-10-10T09:45:00.000Z" });
    const sent: string[] = [];
    const worker = new ReminderWorker(activitiesRepository, reminders, {
      async send(ownerId, title) {
        sent.push(`${ownerId}:${title}`);
      },
    });
    worker.registerOwner("1380335807");

    await worker.processDue();
    await worker.processDue();

    expect(sent).toEqual(["1380335807:Test meeting"]);
    expect(await reminders.due("1380335807")).toHaveLength(0);
  });
});
