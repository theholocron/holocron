import { tokenExpectations } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { EXPECTED } from "./probes/token/expectations.js";
import { PERMISSIONS } from "./probes/token/permissions.js";
import { TOKEN_RESOLVERS } from "./token-resolvers.js";
import { tokens } from "./tokens.js";

describe("the github tokens declaration", () => {
	it("declares every token's permissions from EXPECTED, by envName", () => {
		for (const token of tokens) expect(token.expect).toBe(EXPECTED[token.envName]);
		expect(Object.keys(EXPECTED).sort()).toEqual(tokens.map((t) => t.envName).sort());
	});

	it("names only permissions the probe knows how to read", () => {
		for (const e of tokenExpectations(tokens)) {
			for (const name of Object.keys(e.rules)) expect(Object.keys(PERMISSIONS)).toContain(name);
		}
	});

	it("has a resolver for each token, by its environment variable", () => {
		expect(Object.keys(TOKEN_RESOLVERS).sort()).toEqual(tokens.map((t) => t.envName).sort());
	});

	it("holds the release token in ci only, and every other token in local, dev and ci", () => {
		const layers = (envName: string) => tokenExpectations(tokens, { envName }).map((e) => e.layer);
		expect(layers("HOLOCRON_RELEASE_TOKEN")).toEqual(["ci"]);
		expect(layers("HOLOCRON_ADMIN_TOKEN")).toEqual(["local", "dev", "ci"]);
	});

	it("keeps the narrow tokens off administration and secrets, and org secrets off the admin token", () => {
		const absent = (envName: string) => tokenExpectations(tokens, { envName, layer: "ci" })[0]!.absent;
		expect(absent("HOLOCRON_READ_TOKEN")).toEqual(expect.arrayContaining(["administration", "secrets"]));
		expect(absent("HOLOCRON_ADMIN_TOKEN")).toEqual(["org-secrets"]);
		expect(absent("HOLOCRON_ORG_TOKEN")).toEqual(["org-secrets"]);
	});
});
