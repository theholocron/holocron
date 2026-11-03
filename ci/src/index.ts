/**
 * The reusable workflows and composite actions every repo of the org calls, as text. The files are written once, here;
 * `@theholocron/astromech` reads them to generate what `holocron sync github` pushes, and the `ci` version group
 * (spec `tech-workflows-in-holocron`, issue #1480) versions and tags this folder.
 */
import autoCommitAction from "../actions/auto-commit/action.yml";
import codecovUploadAction from "../actions/codecov-upload/action.yml";
import formatAction from "../actions/format/action.yml";
import holocronAction from "../actions/holocron/action.yml";
import installAction from "../actions/install/action.yml";
import notifyAction from "../actions/notify/action.yml";
import setupAction from "../actions/setup/action.yml";
import setupNodeAction from "../actions/setup-node/action.yml";
import { idFromSource } from "./id-from-source/index.js";

/** The workflow sources by their path from this file (`../workflows/lint/code.yml`), as text. */
const SOURCES = import.meta.glob<string>("../workflows/**/*.yml", { eager: true, import: "default" });

/**
 * The workflows by task id: the source `workflows/<suite>/<leaf>.yml` is `<suite>:<leaf>` and `workflows/<id>.yml` is
 * `<id>` (see {@link idFromSource}); the file a reusable is generated as is `workflowFile(id)`. Most are
 * `workflow_call` implementations; `tag`, `sync-dispatch` and `check-dispatched` also start on an event or by hand.
 * `check-dispatched` is not run via any repo's own thin caller: Sentinel dispatches it directly via the Actions API
 * (holocron#769, holocron#794), so it has no `WORKFLOW_TEMPLATES` entry either.
 */
export const WORKFLOWS: Record<string, string> = Object.fromEntries(
	Object.entries(SOURCES).map(([path, text]) => [idFromSource(path), text])
);

/** Composite actions, by action name (`<name>/action.yml`). */
export const ACTIONS: Record<string, string> = {
	"auto-commit": autoCommitAction,
	"codecov-upload": codecovUploadAction,
	format: formatAction,
	holocron: holocronAction,
	install: installAction,
	notify: notifyAction,
	setup: setupAction,
	"setup-node": setupNodeAction,
};

export { idFromSource } from "./id-from-source/index.js";
export { workflowFile } from "./workflow-file/index.js";
