// Re-exported from @theholocron/http — the canonical home for HTTP primitives.
// createResolveToken is wrapped here to inject the keyring backend so plugins
// don't need to pass it explicitly.
import {
	createResolveToken as _createResolveToken,
	type ResolveTokenConfig as _ResolveTokenConfig,
} from "@theholocron/http";

import { getToken as getKeyringToken } from "./keyring.js";

export { AuthError, type ResolveTokenInput } from "@theholocron/http";

export type ResolveTokenConfig = Omit<_ResolveTokenConfig, "getKeyringToken">;

/** Wraps `createResolveToken` from `@theholocron/http` and injects the
 *  system keyring so plugins stay at a one-liner call site. */
export function createResolveToken(config: ResolveTokenConfig): (input?: import("@theholocron/http").ResolveTokenInput) => string {
	return _createResolveToken({ ...config, getKeyringToken });
}
