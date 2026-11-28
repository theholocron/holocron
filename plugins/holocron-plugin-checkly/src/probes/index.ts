import type { PluginProbes } from "@theholocron/cli";

import { channelProbe } from "./channel.js";
import { deliverProbe } from "./deliver.js";
import type { ChecklyProbeDeps } from "./probe-deps.type.js";

export type { ChecklyProbeDeps } from "./probe-deps.type.js";

export function checklyProbes(deps: ChecklyProbeDeps): PluginProbes {
	return { channel: channelProbe(deps), deliver: deliverProbe(deps) };
}
