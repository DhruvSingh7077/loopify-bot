import { describe, expect, it } from "vitest";
import { ActivityNotFoundError, InvalidActivityTransitionError } from "../src/activities/errors.js";
import { InMemoryActivityRepository } from "../src/activities/repository.js";
import { ActivityService } from "../src/activities/service.js";

describe("activity lifecycle", () => {
  it("supports get, update, and delete", async () => {
    const service = new ActivityService(new InMemoryActivityRepository());
    const created = await service.create("owner-1", { type: "task", title: "Draft proposal" });

    const updated = await service.update("owner-1", created.id, { title: "Draft revised proposal", priority: "high" });
    expect(updated.title).toBe("Draft revised proposal");
    expect((await service.get("owner-1", created.id)).priority).toBe("high");

    await service.delete("owner-1", created.id);
    await expect(service.get("owner-1", created.id)).rejects.toBeInstanceOf(ActivityNotFoundError);
  });

  it("prevents changing a completed activity back to pending", async () => {
    const service = new ActivityService(new InMemoryActivityRepository());
    const created = await service.create("owner-1", { type: "task", title: "Complete once" });

    await service.complete("owner-1", created.id);
    await expect(service.update("owner-1", created.id, { status: "pending" }))
      .rejects.toBeInstanceOf(InvalidActivityTransitionError);
  });
});
