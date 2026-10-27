import { describe, expect, it } from "vitest";

import { AuthError, resolveRelayToken } from "./auth.js";

const none = () => null;

describe("resolveRelayToken", () => {
	it("prefers the Comlink token", () => {
		expect(
			resolveRelayToken({
				env: { HOLOCRON_SENTRY_COMLINK_TOKEN: "comlink", HOLOCRON_SENTRY_TOKEN: "general" },
				keyring: none,
			})
		).toBe("comlink");
		expect(
			resolveRelayToken({ env: {}, keyring: (k) => (k === "sentry.comlink" ? "kr-comlink" : "kr-general") })
		).toBe("kr-comlink");
	});

	it("falls back to the general Sentry token as the last resort", () => {
		expect(resolveRelayToken({ env: { SENTRY_AUTH_TOKEN: "general" }, keyring: none })).toBe("general");
	});

	it("names Sentry when neither is set", () => {
		expect(() => resolveRelayToken({ env: {}, keyring: none })).toThrow(AuthError);
	});
});
