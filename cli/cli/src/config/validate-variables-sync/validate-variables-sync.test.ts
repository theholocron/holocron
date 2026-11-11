import { describe, expect, it } from "vitest";

import type { RepoVariables } from "../config/index.js";
import { validateVariablesSync } from "./validate-variables-sync.js";

const entry = { environment: "Vars", keys: ["TURBO_TEAM"], scope: "org=theholocron" };

describe("validateVariablesSync", () => {
	it("accepts no sync, and a well-formed one", () => {
		expect(() => validateVariablesSync(undefined)).not.toThrow();
		expect(() => validateVariablesSync({ org: { A: "1" } })).not.toThrow();
		expect(() => validateVariablesSync({ sync: [] })).not.toThrow();
		expect(() =>
			validateVariablesSync({
				org: { OTHER: "1" },
				sync: [
					entry,
					{ environment: "Vars", keys: ["X"], visibility: "private", scope: "org=o" },
					{ layer: "ci", keys: ["Y"] },
				],
			})
		).not.toThrow();
	});

	it("rejects a name that is also a literal value of the same scope, whatever its case", () => {
		expect(() => validateVariablesSync({ org: { turbo_team: "x" }, sync: [entry] })).toThrow(
			/TURBO_TEAM.*repo\.variables\.org.*one source per name/
		);
		expect(() => validateVariablesSync({ repo: { A: "1" }, sync: [{ environment: "E", keys: ["A"] }] })).toThrow(
			/repo\.variables\.repo/
		);
	});

	it("allows the same name as a literal of the other scope", () => {
		expect(() => validateVariablesSync({ repo: { TURBO_TEAM: "x" }, sync: [entry] })).not.toThrow();
	});

	it("rejects prune together with sync", () => {
		expect(() => validateVariablesSync({ prune: true, sync: [entry] })).toThrow(/prune.*sync/);
	});

	it("rejects an entry without an environment, keys, a usable scope or a visibility", () => {
		const bad = (e: unknown) => () => validateVariablesSync({ sync: [e] } as RepoVariables);
		expect(bad({ environment: " ", keys: ["A"] })).toThrow(/vault environment/);
		expect(bad({ keys: ["A"] })).toThrow(/or a `layer`/);
		expect(bad({ layer: "ci", environment: "E", keys: ["A"] })).toThrow(/both `layer` and `environment`/);
		expect(bad({ layer: "x", keys: ["A"] })).toThrow(/"local", "dev", "ci", "prod"/);
		expect(bad({ environment: "E" })).toThrow(/needs `keys`/);
		expect(bad({ environment: "E", keys: [] })).toThrow(/needs `keys`/);
		expect(bad({ environment: "E", keys: [""] })).toThrow(/needs `keys`/);
		expect(bad({ environment: "E", keys: ["A"], scope: "env=x" })).toThrow(/"repo" or "org=<name>"/);
		expect(bad({ environment: "E", keys: ["A"], scope: "org=" })).toThrow(/"repo" or "org=<name>"/);
		expect(bad({ environment: "E", keys: ["A"], visibility: "selected" })).toThrow(/"all" or "private"/);
	});
});
