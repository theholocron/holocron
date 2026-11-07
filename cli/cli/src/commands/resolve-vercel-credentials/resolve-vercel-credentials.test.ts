import { clearCredentials, setCredentials } from "@theholocron/kyber/secrets";
import { afterEach, describe, expect, it } from "vitest";

import type { ResolvedHolocronConfig } from "../../config/index.js";
import { resolveVercelCredentials } from "./resolve-vercel-credentials.js";

afterEach(() => clearCredentials());

const vercel = (options: Record<string, string>) => ({ provider: "vercel", packageName: "p-vercel", options });

const configWith = (providers: ResolvedHolocronConfig["providers"]) => ({ providers });

describe("resolveVercelCredentials", () => {
	it("reads all three values from the environment", () => {
		expect(
			resolveVercelCredentials(undefined, {
				VERCEL_TOKEN: "t",
				VERCEL_TEAM_ID: "team_env",
				VERCEL_PROTECTION_BYPASS_SECRET: "s",
			})
		).toEqual({ vercelToken: "t", vercelTeamId: "team_env", bypassSecret: "s" });
	});

	it("leaves out what is not set, treating empty as unset", () => {
		expect(resolveVercelCredentials(undefined, { VERCEL_TOKEN: "" })).toEqual({});
	});

	it("falls back to the credentials providers", () => {
		setCredentials("op", { VERCEL_TOKEN: "from-store" });
		expect(resolveVercelCredentials(undefined, {})).toEqual({ vercelToken: "from-store" });
	});

	it("uses the configured vercel provider's teamId when the environment has none", () => {
		const config = configWith({ deployment: { cardinality: "single", tuple: vercel({ teamId: "team_cfg" }) } });
		expect(resolveVercelCredentials(config, {})).toEqual({ vercelTeamId: "team_cfg" });
	});

	it("lets VERCEL_TEAM_ID override the configured teamId", () => {
		const config = configWith({ deployment: { cardinality: "single", tuple: vercel({ teamId: "team_cfg" }) } });
		expect(resolveVercelCredentials(config, { VERCEL_TEAM_ID: "team_env" })).toEqual({ vercelTeamId: "team_env" });
	});

	it("finds a vercel provider in a list and skips other providers and a missing or empty teamId", () => {
		const config = configWith({
			deployment: {
				cardinality: "many",
				tuples: [
					{ provider: "netlify", packageName: "p-netlify", options: { teamId: "nope" } },
					vercel({}),
					vercel({ teamId: "" }),
					vercel({ teamId: "team_list" }),
				],
			},
		});
		expect(resolveVercelCredentials(config, {})).toEqual({ vercelTeamId: "team_list" });
	});
});
