/**
 * `holocron run <task>` — barrel. `linters/` and `resolve-tool-config/` are
 * private to `run.ts`'s own execution (nothing outside this directory
 * imports them) and are deliberately not re-exported here.
 */
export { runTask } from "./run.js";
export type { ExecFn, RunDeps, RunLogger, RunTaskInput, RunTaskReport } from "./run.type.js";
