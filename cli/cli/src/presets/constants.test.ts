import type { ConfigDirArea } from "@theholocron/datapad";
import { describe, expect, it } from "vitest";

import { placeOrg } from "../config/load-config/place-org/index.js";
import { DEFAULT_DOMAIN, WIKI_SUBDOMAIN, wikiHost } from "./constants.js";
import { docsPreset, nextjsPreset, withCapabilities } from "./index.js";

const orgArea = (value: unknown): ConfigDirArea => ({
	area: "org",
	path: ".holocron/org.ts",
	extension: "ts",
	filepath: "/x/.holocron/org.ts",
	value,
});

describe("wikiHost()", () => {
	it("puts the wiki subdomain under the given zone", () => {
		expect(wikiHost("acme.dev")).toBe(`${WIKI_SUBDOMAIN}.acme.dev`);
	});

	it("defaults to the shared default zone", () => {
		expect(wikiHost()).toBe(`wiki.${DEFAULT_DOMAIN}`);
	});
});

describe("the presets' default domain", () => {
	it("is one constant shared by docs, nextjs and the wiki provider", () => {
		expect(withCapabilities.withDocs().domain).toBe(DEFAULT_DOMAIN);
		expect(withCapabilities.withNextjs()[1]?.domain).toBe(DEFAULT_DOMAIN);
		expect(withCapabilities.withWiki().providers?.wiki).toEqual([
			"fern",
			{ domain: wikiHost(), fernOrg: "holocron" },
		]);
	});

	it("is a ConfigError when a preset's domain is spread into a config whose org area also sets one", () => {
		const area = orgArea({ domain: "acme.dev" });
		expect(() => placeOrg({ ...docsPreset() }, area)).toThrow(
			/domain is set in the config and in \.holocron\/org\.ts/
		);
		expect(() => placeOrg({ ...nextjsPreset() }, area)).toThrow(/domain is set in the config and in/);
	});

	it("is not a conflict when the config takes everything but domain from the preset", () => {
		const { repo, providers, org, docs } = docsPreset();
		const placed = placeOrg({ repo, providers, org, docs }, orgArea({ domain: "acme.dev" }));
		expect(placed.domain).toBe("acme.dev");
	});
});
