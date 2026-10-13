export class ActivityNotFoundError extends Error {
  constructor() {
    super("Activity not found");
    this.name = "ActivityNotFoundError";
  }
}

export class InvalidActivityTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot change activity status from ${from} to ${to}`);
    this.name = "InvalidActivityTransitionError";
  }
}
