import type { PluginProbes } from "@theholocron/cli";

import { integrationsProbe } from "./integrations.js";
import type { SentryProbeDeps } from "./probe-deps.type.js";
import { rulesProbe } from "./rules.js";
import { sendErrorProbe } from "./send-error.js";

export type { SentryProbeDeps } from "./probe-deps.type.js";

export function sentryProbes(deps: SentryProbeDeps): PluginProbes {
	return {
		integrations: integrationsProbe(deps),
		rules: rulesProbe(deps),
		"send-error": sendErrorProbe(deps),
	};
}
