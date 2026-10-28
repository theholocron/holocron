import { mergeLayers } from "@theholocron/datapad";

import { coerceTasks } from "../coerce-tasks/index.js";
import type { TasksInput } from "../load/index.js";
import type { TasksConfig } from "../schema/index.js";

/**
 * The same layering as {@link loadTasksConfig}, for callers that load the two
 * sources some other way (Sentinel reads them from the GitHub API, not
 * from disk, holocron#916): `holocron.config.*`'s `tasks` value first,
 * then a dedicated `astromech.config.*`'s default export merged on top.
 * Either may be `undefined` (source absent); returns `{}` when both are.
 */
export function mergeTasksLayers(parentTasks: TasksInput | undefined, dedicated: TasksInput | undefined): TasksConfig {
	return mergeLayers([coerceTasks(parentTasks), coerceTasks(dedicated)]) ?? {};
}
