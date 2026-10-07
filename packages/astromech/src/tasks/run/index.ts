/**
 * `holocron run <task>` — barrel. `linters.ts` and `resolver.ts` are
 * private to `run.ts`'s own execution (nothing outside this directory
 * imports them) and are deliberately not re-exported here.
 */
export { type ExecFn, type RunDeps, type RunLogger, runTask, type RunTaskInput, type RunTaskReport } from "./run.js";
