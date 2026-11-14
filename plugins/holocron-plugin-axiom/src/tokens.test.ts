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

	it("declares the same rules in every layer: read and ingest required, query absent, because one token serves them all", () => {
		const permissions = tokens[0]!.expect!.permissions!;
		const rules = { read: "required", ingest: "required", query: "absent" };
		for (const layer of ["local", "dev", "ci", "prod"] as const) expect(permissions[layer]).toEqual(rules);
	});

	it("is read through tokenExpectations(), layer by layer", () => {
		expect(tokenExpectations(tokens).map((e) => e.layer)).toEqual(["local", "dev", "ci", "prod"]);
		const [prod] = tokenExpectations(tokens, { layer: "prod" });
		expect(prod!.required).toEqual(["read", "ingest"]);
		expect(prod!.absent).toEqual(["query"]);
		expect(tokenExpectations(tokens, { layer: "test" })).toEqual([]);
	});
});
