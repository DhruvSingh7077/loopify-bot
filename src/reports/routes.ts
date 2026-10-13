import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ActivityRepository } from "../activities/repository.js";

const ownerSchema = z.string().trim().min(1);

function ownerIdFrom(request: { headers: Record<string, unknown> }) {
  return ownerSchema.parse(request.headers["x-owner-id"]);
}

function within(activity: { scheduledFor?: string }, from: Date, to: Date) {
  return Boolean(
    activity.scheduledFor &&
    activity.scheduledFor >= from.toISOString() &&
    activity.scheduledFor < to.toISOString(),
  );
}

export function registerReportRoutes(app: FastifyInstance, activities: ActivityRepository) {
  app.get("/reports", async (request) => {
    const ownerId = ownerIdFrom(request);
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
    const startOfNextWeek = new Date(startOfTomorrow);
    startOfNextWeek.setUTCDate(startOfNextWeek.getUTCDate() + 7);
    const all = await activities.list(ownerId);
    const today = all.filter((activity) => within(activity, startOfToday, startOfTomorrow));
    const overdue = all.filter((activity) =>
      activity.status === "pending" && activity.scheduledFor && activity.scheduledFor < now.toISOString());
    const completed = all.filter((activity) => activity.status === "completed");
    const upcomingMeetings = all.filter((activity) =>
      activity.status === "pending" && activity.type === "meeting" &&
      within(activity, startOfTomorrow, startOfNextWeek));
    const followUps = all.filter((activity) =>
      activity.status === "pending" && activity.type === "follow-up");
    const tracked = all.filter((activity) => activity.status !== "cancelled");

    return {
      generatedAt: now.toISOString(),
      summary: {
        total: tracked.length,
        pending: tracked.filter((activity) => activity.status === "pending").length,
        completed: completed.length,
        cancelled: all.filter((activity) => activity.status === "cancelled").length,
        completionRate: tracked.length ? Math.round((completed.length / tracked.length) * 100) : 0,
      },
      today,
      overdue,
      completed,
      upcomingMeetings,
      followUps,
    };
  });
}
