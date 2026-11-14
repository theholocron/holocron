import { tokenExpectations } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { AuthError, resolveRelayToken, tokens } from "./auth.js";
import { COMLINK, GENERAL, RELEASE } from "./probes/token/expectations.js";

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

describe("the plugin's tokens export", () => {
	it("lists the general token, the Comlink relay's and the CI release token, each with its declaration", () => {
		expect(tokens).toEqual([
			{
				envName: "HOLOCRON_SENTRY_TOKEN",
				vendorEnvName: "SENTRY_AUTH_TOKEN",
				keyringKey: "sentry",
				expect: GENERAL,
			},
			{ envName: "HOLOCRON_SENTRY_COMLINK_TOKEN", keyringKey: "sentry.comlink", expect: COMLINK },
			{
				envName: "HOLOCRON_SENTRY_RELEASE_TOKEN",
				keyringKey: "sentry.release",
				optional: true,
				verifiable: false,
				expect: RELEASE,
			},
		]);
	});

	it("declares a laptop's tokens as reads and CI's release token as reaching none of them, as the token docs say", () => {
		const [general, comlink, release] = tokens;
		expect(general!.expect!.permissions!.dev).toEqual({ org: "required", projects: "required" });
		expect(comlink!.expect!.permissions!.local).toEqual({
			org: "required",
			projects: "required",
			alerts: "required",
		});
		expect(Object.values(release!.expect!.permissions!.ci!)).toEqual(["absent", "absent", "absent"]);
	});

	it("is read through tokenExpectations(), layer by layer", () => {
		expect(tokenExpectations(tokens).map((e) => `${e.layer}:${e.envName}`)).toEqual([
			"local:HOLOCRON_SENTRY_TOKEN",
			"dev:HOLOCRON_SENTRY_TOKEN",
			"local:HOLOCRON_SENTRY_COMLINK_TOKEN",
			"dev:HOLOCRON_SENTRY_COMLINK_TOKEN",
			"ci:HOLOCRON_SENTRY_RELEASE_TOKEN",
		]);
		const [ci] = tokenExpectations(tokens, { layer: "ci" });
		expect(ci!.absent).toEqual(["org", "projects", "alerts"]);
		expect(tokenExpectations(tokens, { layer: "prod" })).toEqual([]);
	});
});
