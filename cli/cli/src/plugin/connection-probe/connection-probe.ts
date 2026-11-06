import {
	connectionProbe as kyberConnectionProbe,
	type ConnectionProbeInput as KyberConnectionProbeInput,
} from "@theholocron/kyber/checks";

import type { VerifyTokenResult } from "../../commands/auth/auth.type.js";
import type { Probe } from "../probe/index.js";

/** What a connection probe needs to check a provider's host and token: kyber's input, with the plugin's `verifyToken` as `verify`. */
export interface ConnectionProbeInput extends Omit<KyberConnectionProbeInput, "verify"> {
	/** The plugin's `verifyToken`: asks the provider who the token belongs to. */
	verify: (token: string) => Promise<VerifyTokenResult>;
}

/**
 * The `connection` probe every provider offers, for telling a network problem from a credential problem. The checks are
 * kyber's `connectionProbe`; this types the result as the plugin system's {@link Probe} and `verify` as `VerifyTokenResult`.
 */
export function connectionProbe(input: ConnectionProbeInput): Probe {
	return kyberConnectionProbe(input);
}
