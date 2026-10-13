import { describe, expect, it } from "vitest";
import { InMemoryActivityRepository } from "../src/activities/repository.js";
import { ActivityService } from "../src/activities/service.js";
import { InMemoryContactRepository } from "../src/contacts/repository.js";
import { ContactService } from "../src/contacts/service.js";

describe("contacts", () => {
  it("creates, searches, and links a contact to an activity", async () => {
    const activities = new InMemoryActivityRepository();
    const service = new ContactService(new InMemoryContactRepository(), activities);
    const contact = await service.create("owner-1", {
      name: "Kiran Baug",
      company: "Kiran Industries",
      relationship: "customer",
    });
    const activity = await new ActivityService(activities).create("owner-1", {
      type: "call",
      title: "Discuss CNC project",
    });

    expect(await service.list("owner-1", "industries")).toHaveLength(1);
    await service.linkActivity("owner-1", contact.id, activity.id);
    expect((await service.timeline("owner-1", contact.id))[0].contactId).toBe(contact.id);
  });

  it("keeps contacts isolated by owner", async () => {
    const service = new ContactService(new InMemoryContactRepository(), new InMemoryActivityRepository());
    await service.create("owner-1", { name: "Private contact" });
    expect(await service.list("owner-2")).toHaveLength(0);
  });
});
