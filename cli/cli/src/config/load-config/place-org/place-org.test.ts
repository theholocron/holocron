import type { ConfigDirArea } from "@theholocron/datapad";
import { describe, expect, it } from "vitest";

import type { HolocronConfig } from "../../config/index.js";
import { placeOrg } from "./place-org.js";

const org = (value: unknown): ConfigDirArea => ({
	area: "org",
	path: ".holocron/org.ts",
	extension: "ts",
	filepath: "/x/.holocron/org.ts",
	value,
});

const NONE = {} as HolocronConfig;
const ORG = { vercel: { teamId: "team_1" }, checkly: { accountId: "acc_1" } };

describe("placeOrg", () => {
	it("fills an option the config leaves out of a tuple", () => {
		const raw: HolocronConfig = { providers: { deployment: ["vercel", { domain: "a.dev" }] } };
		expect(placeOrg(raw, org(ORG)).providers?.deployment).toEqual([
			"vercel",
			{ domain: "a.dev", teamId: "team_1" },
		]);
		expect(raw.providers?.deployment).toEqual(["vercel", { domain: "a.dev" }]);
	});

	it("gives a bare provider name its options", () => {
		const raw: HolocronConfig = { providers: { monitoring: "checkly" } };
		expect(placeOrg(raw, org(ORG)).providers?.monitoring).toEqual(["checkly", { accountId: "acc_1" }]);
	});

	it("fills the matching entry of a provider list and leaves the others", () => {
		const raw: HolocronConfig = { providers: { monitoring: ["datadog", ["checkly", { checks: [] }]] } };
		expect(placeOrg(raw, org(ORG)).providers?.monitoring).toEqual([
			"datadog",
			["checkly", { checks: [], accountId: "acc_1" }],
		]);
	});

	it("errors naming both locations when an option is set inline and in the file", () => {
		const raw: HolocronConfig = { providers: { deployment: ["vercel", { teamId: "team_2" }] } };
		expect(() => placeOrg(raw, org(ORG))).toThrow(
			/vercel\.teamId is set in providers\.deployment and in \.holocron\/org\.ts/
		);
	});

	it("errors for a provider the area does not know", () => {
		expect(() => placeOrg({ providers: {} }, org({ netlify: { teamId: "x" } }))).toThrow(
			/unknown provider "netlify"/
		);
	});

	it("errors for an option the provider does not take, a non-object provider, and a non-string value", () => {
		expect(() => placeOrg(NONE, org({ vercel: { accountId: "x" } }))).toThrow(
			/"vercel.accountId" is not an org option/
		);
		expect(() => placeOrg(NONE, org({ vercel: "x" }))).toThrow(/"vercel" must be an object/);
		expect(() => placeOrg(NONE, org({ vercel: { teamId: 1 } }))).toThrow(/non-empty string/);
		expect(() => placeOrg(NONE, org(["x"]))).toThrow(/must export the org settings as an object/);
	});

	it("ignores a provider the config does not use", () => {
		const raw: HolocronConfig = { providers: { dns: "cloudflare", source: "github" } };
		expect(placeOrg(raw, org({ vercel: { teamId: "team_1" } })).providers).toEqual(raw.providers);
	});

	it("leaves a config with no providers, and an empty provider entry, as it was", () => {
		const noProviders = { name: "demo" } as HolocronConfig;
		expect(placeOrg(noProviders, org(ORG))).toBe(noProviders);
		const raw: HolocronConfig = { providers: { deployment: "vercel" } };
		expect(placeOrg(raw, org({ vercel: {} })).providers).toEqual({ deployment: "vercel" });
	});
});
