import { tokenExpectations } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { tokens } from "./index.js";
import { EXPECTED } from "./probes/token/expectations.js";

describe("the plugin's tokens export", () => {
	it("lists each token the plugin resolves, with where it is looked up and what each layer's token must carry", () => {
		expect(tokens).toEqual([
			{
				envName: "HOLOCRON_CLOUDFLARE_TOKEN",
				vendorEnvName: "CLOUDFLARE_API_TOKEN",
				keyringKey: "cloudflare",
				expect: EXPECTED,
			},
		]);
	});

	it("declares CI's token as Pages only and a laptop's as all six, the same as the token table in the docs", () => {
		const { ci, dev, local } = tokens[0]!.expect!.permissions!;
		expect(Object.entries(ci!).filter(([, rule]) => rule === "required")).toEqual([["pages", "required"]]);
		expect(Object.values(ci!).filter((rule) => rule === "absent")).toHaveLength(5);
		expect(Object.values(dev!)).toEqual(Array(6).fill("required"));
		expect(local).toEqual(dev);
	});

	it("is read through tokenExpectations(), layer by layer", () => {
		expect(tokenExpectations(tokens).map((e) => e.layer)).toEqual(["local", "dev", "ci"]);
		const [ci] = tokenExpectations(tokens, { layer: "ci" });
		expect(ci!.required).toEqual(["pages"]);
		expect(ci!.absent).toEqual(["zone", "dns", "routes", "scripts", "tunnels"]);
		expect(tokenExpectations(tokens, { layer: "prod" })).toEqual([]);
	});
});
