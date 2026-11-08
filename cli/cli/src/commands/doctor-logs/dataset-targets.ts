import { PREFIX } from "@theholocron/env-utils/lookup";

import { resolveValue } from "../../auth.js";
import type { ResolvedHolocronConfig } from "../../config/index.js";
import { resolveCliDataset } from "../../observability/logger/index.js";
import type { LogsDatasetTarget } from "./doctor-logs.type.js";

const SENTINEL_VARIABLE = "SENTINEL_AXIOM_DATASET";

/** `SENTINEL_AXIOM_DATASET` to `sentinel`: the part before `_AXIOM_DATASET`, lower case. */
const idOf = (variable: string): string => variable.replace(/_AXIOM_DATASET$/, "").toLowerCase();

/**
 * The datasets this repo's setup ships logs to, each resolved the way its service resolves it (ADR-0019): the CLI's
 * through the logger's own chain (`HOLOCRON_AXIOM_DATASET`, then `AXIOM_DATASET`, then `log.axiom.dataset`, then the
 * `credentials` providers), Sentinel's and any other service's through the environment then the `credentials`
 * providers. Another service is the one `dev.serve.logging.datasetVar` names, when it is not one of those two.
 * Comlink does not log to Axiom yet, so it is not listed.
 */
export function datasetTargets(config: ResolvedHolocronConfig): LogsDatasetTarget[] {
	const targets: LogsDatasetTarget[] = [
		{
			id: "cli",
			label: "the CLI",
			variable: `${PREFIX}_AXIOM_DATASET`,
			name: resolveCliDataset({ configAxiomDataset: config.log?.axiom?.dataset }, false),
			fix: "run `holocron repo setup`, which provisions it",
		},
		{
			id: "sentinel",
			label: "Sentinel",
			variable: SENTINEL_VARIABLE,
			name: resolveValue([SENTINEL_VARIABLE]),
			fix: "create it in Axiom (setup provisions only the CLI's dataset)",
		},
	];
	const other = config.dev?.serve?.logging?.datasetVar;
	if (other && !targets.some((t) => t.variable === other || other === "AXIOM_DATASET")) {
		targets.push({
			id: idOf(other),
			label: `the service behind ${other}`,
			variable: other,
			name: resolveValue([other]),
			fix: "create it in Axiom (setup provisions only the CLI's dataset)",
		});
	}
	return targets;
}
