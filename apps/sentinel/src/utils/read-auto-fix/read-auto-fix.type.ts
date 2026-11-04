import type { TaskEntry } from "@theholocron/astromech/config";

/** The part of a `tasks:` entry the auto-fix opt-out reads: its name and its `with` options. */
export type AutoFixTask = Pick<TaskEntry, "name" | "with">;
