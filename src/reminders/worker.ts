import type { ActivityRepository } from "../activities/repository.js";
import type { ReminderService } from "./service.js";

export interface ReminderNotificationSender {
  send(ownerId: string, activityTitle: string, scheduledFor?: string): Promise<void>;
}

export class ReminderWorker {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly activities: ActivityRepository,
    private readonly reminders: ReminderService,
    private readonly sender: ReminderNotificationSender,
    private readonly intervalMs = 30_000,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processDue();
    }, this.intervalMs);
    void this.processDue();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async processDue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const owners = new Set<string>();
      for (const ownerId of this.registeredOwners) owners.add(ownerId);
      for (const ownerId of owners) {
        const due = await this.reminders.due(ownerId);
        for (const reminder of due) {
          const activity = await this.activities.findById(ownerId, reminder.activityId);
          if (!activity || activity.status !== "pending") {
            await this.reminders.markSent(ownerId, reminder.id);
            continue;
          }
          await this.sender.send(ownerId, activity.title, activity.scheduledFor);
          await this.reminders.markSent(ownerId, reminder.id);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private readonly registeredOwners = new Set<string>();

  registerOwner(ownerId: string): void {
    this.registeredOwners.add(ownerId);
  }
}
