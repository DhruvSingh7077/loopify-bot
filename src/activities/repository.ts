import type { Activity } from "./types.js";

export interface ActivityFilters {
  status?: Activity["status"];
  type?: Activity["type"];
  priority?: Activity["priority"];
  contactId?: string;
  from?: string;
  to?: string;
}

export interface ActivityRepository {
  create(activity: Activity): Promise<Activity>;
  findById(ownerId: string, id: string): Promise<Activity | undefined>;
  list(ownerId: string, filters?: ActivityFilters): Promise<Activity[]>;
  update(ownerId: string, id: string, changes: Partial<Activity>): Promise<Activity | undefined>;
  delete(ownerId: string, id: string): Promise<boolean>;
}

export class InMemoryActivityRepository implements ActivityRepository {
  private readonly activities = new Map<string, Activity>();

  async create(activity: Activity): Promise<Activity> {
    this.activities.set(activity.id, activity);
    return activity;
  }

  async findById(ownerId: string, id: string): Promise<Activity | undefined> {
    const activity = this.activities.get(id);
    return activity?.ownerId === ownerId ? activity : undefined;
  }

  async list(ownerId: string, filters: ActivityFilters = {}): Promise<Activity[]> {
    return [...this.activities.values()]
      .filter((activity) => activity.ownerId === ownerId)
      .filter((activity) => !filters.status || activity.status === filters.status)
      .filter((activity) => !filters.type || activity.type === filters.type)
      .filter((activity) => !filters.priority || activity.priority === filters.priority)
      .filter((activity) => !filters.contactId || activity.contactId === filters.contactId)
      .filter((activity) => !filters.from || !activity.scheduledFor || activity.scheduledFor >= filters.from)
      .filter((activity) => !filters.to || !activity.scheduledFor || activity.scheduledFor <= filters.to)
      .sort((left, right) => (left.scheduledFor ?? left.createdAt).localeCompare(right.scheduledFor ?? right.createdAt));
  }

  async update(ownerId: string, id: string, changes: Partial<Activity>): Promise<Activity | undefined> {
    const current = await this.findById(ownerId, id);
    if (!current) return undefined;

    const updated = { ...current, ...changes, id: current.id, ownerId: current.ownerId };
    this.activities.set(id, updated);
    return updated;
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    const activity = await this.findById(ownerId, id);
    return activity ? this.activities.delete(id) : false;
  }
}
