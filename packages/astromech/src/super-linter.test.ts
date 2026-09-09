import { describe, expect, it } from "vitest";

import { baselineSuperLinterEnv, superLinterConfig } from "./super-linter.js";

describe("superLinterConfig", () => {
	it("emits only the always-on VALIDATE_*/FIX_* keys with no explicit list or config files", () => {
		const { env, linters, configInputs } = superLinterConfig({ rootFiles: [] });

		expect(env["VALIDATE_YAML"]).toBe("true");
		expect(env["VALIDATE_GITLEAKS"]).toBe("true");
		expect(env["VALIDATE_GIT_COMMITLINT"]).toBe("true");
		expect(env["VALIDATE_GITHUB_ACTIONS"]).toBe("true");
		expect(env["VALIDATE_EDITORCONFIG"]).toBe("true");
		expect(env["VALIDATE_GIT_MERGE_CONFLICT_MARKERS"]).toBe("true");
		expect(env["VALIDATE_TYPESCRIPT_PRETTIER"]).toBe("true");
		expect(env["FIX_MARKDOWN_PRETTIER"]).toBe("true");

		// eslint is detect-gated — not in the baseline
		expect(env["VALIDATE_JAVASCRIPT_ES"]).toBeUndefined();
		expect(env["VALIDATE_MARKDOWN"]).toBeUndefined();

		expect(linters).toContain("prettier");
		expect(linters).not.toContain("eslint");
		expect(configInputs).toEqual({ "prettier-config": true, "yaml-config": true });
	});

	it("every env value is the string \"true\"", () => {
		const { env } = superLinterConfig({ explicit: ["eslint", "prettier", "yamllint"], rootFiles: [] });
		expect(Object.values(env).every((v) => v === "true")).toBe(true);
	});

	it("adds the eslint keys + eslint-config input when an eslint config is present", () => {
		const { env, linters, configInputs } = superLinterConfig({ rootFiles: ["eslint.config.ts"] });
		expect(env["VALIDATE_JAVASCRIPT_ES"]).toBe("true");
		expect(env["VALIDATE_TYPESCRIPT_ES"]).toBe("true");
		expect(linters[0]).toBe("eslint");
		expect(configInputs["eslint-config"]).toBe(true);
	});

	it("an explicit list produces exactly that set's keys", () => {
		const { env } = superLinterConfig({ explicit: ["eslint", "yamllint"], rootFiles: ["eslint.config.ts"] });
		expect(env["VALIDATE_JAVASCRIPT_ES"]).toBe("true");
		expect(env["VALIDATE_YAML"]).toBe("true");
		// prettier is always-on but excluded by the explicit list
		expect(env["VALIDATE_TYPESCRIPT_PRETTIER"]).toBeUndefined();
	});

	it("includeFix: false omits every FIX_* key", () => {
		const { env } = superLinterConfig({ explicit: ["prettier"], rootFiles: [], includeFix: false });
		expect(Object.keys(env).some((k) => k.startsWith("FIX_"))).toBe(false);
		expect(env["VALIDATE_TYPESCRIPT_PRETTIER"]).toBe("true");
	});

	it("throws on an unknown explicit linter (delegates to resolveLinters)", () => {
		expect(() => superLinterConfig({ explicit: ["nope"], rootFiles: [] })).toThrow(/unknown linter/);
	});
});

describe("baselineSuperLinterEnv", () => {
	it("equals superLinterConfig with no detection", () => {
		expect(baselineSuperLinterEnv()).toEqual(superLinterConfig({ rootFiles: [] }).env);
	});

	it("has no eslint or markdownlint keys (detect-gated)", () => {
		const env = baselineSuperLinterEnv();
		expect(env["VALIDATE_JAVASCRIPT_ES"]).toBeUndefined();
		expect(env["VALIDATE_MARKDOWN"]).toBeUndefined();
	});
});
