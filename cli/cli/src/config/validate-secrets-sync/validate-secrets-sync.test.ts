import { describe, expect, it } from "vitest";

import { validateSecretsSync } from "./validate-secrets-sync.js";

describe("validateSecretsSync", () => {
	it("accepts no entries, an environment, or a layer", () => {
		expect(() => validateSecretsSync(undefined)).not.toThrow();
		expect(() => validateSecretsSync({ sync: [{ environment: "E" }, { layer: "ci", keys: ["A"] }] })).not.toThrow();
	});

	it.each([
		["neither", {}],
		["both", { environment: "E", layer: "ci" }],
		["a layer that is no layer word", { layer: "Prod" }],
		["the dev layer, which is never synced", { layer: "dev", keys: ["A"] }],
		["the local layer, which is never synced", { layer: "local" }],
	])("is a ConfigError for %s", (_label, entry) => {
		const err = (() => {
			try {
				validateSecretsSync({ sync: [entry as never] });
			} catch (e) {
				return e;
			}
		})();
		expect((err as Error).name).toBe("ConfigError");
		expect((err as Error).message).toMatch(/repo\.secrets\.sync/);
	});

	describe("organization scope", () => {
		const org = (extra: Record<string, unknown> = {}) => ({
			sync: [{ layer: "ci", scope: "org=theholocron", keys: ["A"], repos: ["holocron"], ...extra }],
		});
		const message = (secrets: unknown): string | undefined => {
			try {
				validateSecretsSync(secrets as never);
			} catch (e) {
				expect((e as Error).name).toBe("ConfigError");
				return (e as Error).message;
			}
		};

		it("accepts selected readers, with or without visibility, bare or owner-qualified names", () => {
			expect(message(org())).toBeUndefined();
			expect(
				message(org({ visibility: "selected", repos: ["theholocron/holocron", ".github"] }))
			).toBeUndefined();
		});

		it("accepts the other scopes without readers", () => {
			expect(
				message({
					sync: [
						{ layer: "ci" },
						{ layer: "ci", scope: "repo" },
						{ layer: "ci", scope: "env=prod", keys: ["A"] },
					],
				})
			).toBeUndefined();
		});

		it("rejects an organization scope with no reader list", () => {
			expect(message(org({ repos: undefined }))).toMatch(/needs `repos`/);
			expect(message(org({ repos: [] }))).toMatch(/needs `repos`/);
			expect(message(org({ repos: [""] }))).toMatch(/needs `repos`/);
			expect(message(org({ repos: ["theholocron/"] }))).toMatch(/needs `repos`/);
			expect(message(org({ repos: [3] }))).toMatch(/needs `repos`/);
		});

		it("rejects visibility all and private for a secret", () => {
			expect(message(org({ visibility: "all" }))).toMatch(/never readable by every repository/);
			expect(message(org({ visibility: "private" }))).toMatch(/"private"/);
		});

		it("rejects a repository of another organization", () => {
			expect(message(org({ repos: ["other/holocron"] }))).toMatch(/"other\/holocron".*"theholocron"/);
		});

		it("rejects readers or visibility on a repo or environment scope", () => {
			expect(message({ sync: [{ layer: "ci", repos: ["holocron"] }] })).toMatch(/only an organization scope/);
			expect(message({ sync: [{ layer: "ci", scope: "env=prod", visibility: "selected" }] })).toMatch(
				/only an organization scope/
			);
		});

		it("rejects one key with two different reader lists, and accepts the same list twice", () => {
			const two = (second: string[]) => ({
				sync: [
					{ layer: "ci", scope: "org=theholocron", keys: ["A"], repos: ["holocron", ".github"] },
					{ layer: "prod", scope: "org=theholocron", keys: ["a"], repos: second },
				],
			});
			expect(message(two([".github", "theholocron/holocron"]))).toBeUndefined();
			expect(message(two(["holocron"]))).toMatch(/different readers \[.github, holocron\]/);
		});

		it("accepts an entry with no keys (every key of the environment) once it has readers", () => {
			expect(message({ sync: [{ layer: "ci", scope: "org=theholocron", repos: ["holocron"] }] })).toBeUndefined();
		});
	});
});
