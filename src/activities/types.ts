export const activityTypes = ["task", "meeting", "call", "follow-up"] as const;
export type ActivityType = (typeof activityTypes)[number];

export const activityStatuses = ["pending", "completed", "cancelled"] as const;
export type ActivityStatus = (typeof activityStatuses)[number];

export const activityPriorities = ["critical", "high", "medium", "low"] as const;
export type ActivityPriority = (typeof activityPriorities)[number];

export interface Activity {
  id: string;
  ownerId: string;
  type: ActivityType;
  title: string;
  description?: string;
  status: ActivityStatus;
  priority: ActivityPriority;
  scheduledFor?: string;
  contactId?: string;
  createdAt: string;
  updatedAt: string;
}
