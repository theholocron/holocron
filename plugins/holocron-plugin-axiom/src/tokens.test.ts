import { tokenExpectations } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { tokens } from "./index.js";
import { EXPECTED } from "./probes/token/expectations.js";

describe("the plugin's tokens export", () => {
	it("lists each token the plugin resolves, with where it is looked up and what each layer's token must carry", () => {
		expect(tokens).toEqual([
			{ envName: "HOLOCRON_AXIOM_TOKEN", vendorEnvName: "AXIOM_TOKEN", keyringKey: "axiom", expect: EXPECTED },
		]);
	});

	it("declares CI's token as ship and check, a laptop's as ship, read and query, the same as the token table in the docs", () => {
		const { ci, dev, local } = tokens[0]!.expect!.permissions!;
		expect(ci).toEqual({ read: "required", ingest: "required", query: "absent" });
		expect(Object.values(dev!)).toEqual(["required", "required", "required"]);
		expect(local).toEqual(dev);
	});

	it("is read through tokenExpectations(), layer by layer", () => {
		expect(tokenExpectations(tokens).map((e) => e.layer)).toEqual(["local", "dev", "ci"]);
		const [ci] = tokenExpectations(tokens, { layer: "ci" });
		expect(ci!.required).toEqual(["read", "ingest"]);
		expect(ci!.absent).toEqual(["query"]);
		expect(tokenExpectations(tokens, { layer: "prod" })).toEqual([]);
	});
});
