import type { ScheduledTask } from "../scheduled-dispatch.type.js";

/**
 * The workflows Sentinel starts when a cron entry in `vercel.json` calls `/api/scheduled?task=<id>` (spec
 * `tech-sentinel-scheduled-dispatch`, #2609). GitHub starts a `schedule` workflow late or drops it when it is busy, so
 * the trigger moves here; the workflow, its command and its heartbeat ping stay as they are. A new task is one row here
 * and one entry in `vercel.json`. Names only: the repository is `SENTINEL_SCHEDULE_REPO`.
 */
export const SCHEDULED_TASKS: Readonly<Record<string, ScheduledTask>> = {
	"sync-incidents": { workflow: "ci.sync-incidents.yml" },
};
