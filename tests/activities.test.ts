import { describe, expect, it } from "vitest";
import { InMemoryActivityRepository } from "../src/activities/repository.js";
import { ActivityService } from "../src/activities/service.js";

describe("activity service", () => {
  it("creates and completes an activity for its owner", async () => {
    const service = new ActivityService(new InMemoryActivityRepository());
    const created = await service.create("owner-1", {
      type: "call",
      title: "Call ABC about quotation",
      priority: "high",
    });

    expect(created.status).toBe("pending");
    expect((await service.list("owner-2"))).toHaveLength(0);

    const completed = await service.complete("owner-1", created.id);
    expect(completed?.status).toBe("completed");
  });

  it("rejects an empty title", async () => {
    const service = new ActivityService(new InMemoryActivityRepository());

    await expect(service.create("owner-1", {
      type: "task",
      title: " ",
    })).rejects.toThrow();
  });
});
