import { runUpgradeNode as run } from "@theholocron/astromech/upgrade";

import { getLogger } from "../../observability/logger/index.js";
import type { RunUpgradeNodeInput, UpgradeNodeReport } from "./upgrade-node.type.js";

/**
 * `holocron upgrade node` — the generic Node.js pin rewrite lives in `@theholocron/astromech/upgrade`; this
 * binds it to the command-scoped logger.
 */
export function runUpgradeNode(input: RunUpgradeNodeInput): Promise<UpgradeNodeReport> {
	return run({ logger: getLogger(), ...input });
}
