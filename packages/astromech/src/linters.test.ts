import { describe, expect, it } from "vitest";

import { LINTER_NAMES, LINTERS, resolveLinters } from "./linters.js";

const ALWAYS = Object.entries(LINTERS)
	.filter(([, d]) => d.always)
	.map(([n]) => n);

describe("LINTERS registry", () => {
	it("LINTER_NAMES mirrors the registry keys", () => {
		expect([...LINTER_NAMES].sort()).toEqual(Object.keys(LINTERS).sort());
	});

	it("keys are lower-case linter names", () => {
		for (const key of Object.keys(LINTERS)) expect(key).toMatch(/^[a-z][a-z-]*$/);
	});

	it("every validate/fix key is a super-linter VALIDATE_*/FIX_* var", () => {
		for (const [name, def] of Object.entries(LINTERS)) {
			for (const key of def.validate) expect(key, `${name}.validate`).toMatch(/^VALIDATE_[A-Z_]+$/);
			for (const key of def.fix ?? []) expect(key, `${name}.fix`).toMatch(/^FIX_[A-Z_]+$/);
		}
	});

	it("each linter is always-on XOR detect-gated", () => {
		for (const [name, def] of Object.entries(LINTERS)) {
			const gated = Boolean(def.detect && def.detect.length > 0);
			expect(Boolean(def.always) !== gated, `${name}`).toBe(true);
		}
	});

	it("a linter with an installHint also has a localBin", () => {
		const hinted = Object.entries(LINTERS).filter(([, d]) => d.installHint);
		expect(hinted.every(([, d]) => d.localBin !== undefined)).toBe(true);
	});
});

describe("resolveLinters", () => {
	it("returns exactly the always-on set (declaration order) with no explicit list and no config files", () => {
		const got = resolveLinters({ rootFiles: [] }).map((r) => r.name);
		expect(got).toEqual(Object.keys(LINTERS).filter((n) => LINTERS[n]!.always));
		expect(got).toEqual(ALWAYS);
	});

	it("adds eslint when an eslint config file is present at the root", () => {
		const got = resolveLinters({ rootFiles: ["package.json", "eslint.config.ts"] }).map((r) => r.name);
		expect(got).toContain("eslint");
		expect(got[0]).toBe("eslint"); // declaration order — eslint is first
	});

	it("adds markdownlint when a markdownlint config file is present", () => {
		const got = resolveLinters({ rootFiles: [".markdownlint-cli2.jsonc"] }).map((r) => r.name);
		expect(got).toContain("markdownlint");
	});

	it("an explicit list wins verbatim, ordered by the registry", () => {
		const got = resolveLinters({ explicit: ["prettier", "eslint"], rootFiles: [] }).map((r) => r.name);
		expect(got).toEqual(["eslint", "prettier"]);
	});

	it("an explicit list ignores auto-detection (no always-on linters leak in)", () => {
		const got = resolveLinters({ explicit: ["eslint"], rootFiles: ["eslint.config.ts"] }).map((r) => r.name);
		expect(got).toEqual(["eslint"]);
	});

	it("an empty explicit list falls back to auto-detect", () => {
		expect(resolveLinters({ explicit: [], rootFiles: [] }).map((r) => r.name)).toEqual(ALWAYS);
	});

	it("throws on an unknown explicit linter name, listing the known set", () => {
		const err = (() => {
			try {
				resolveLinters({ explicit: ["eslint", "biome"], rootFiles: [] });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/unknown linter "biome"/);
		expect((err as Error).message).toMatch(/known: eslint, prettier/);
	});

	it("pluralises the error for multiple unknown names", () => {
		const err = (() => {
			try {
				resolveLinters({ explicit: ["biome", "oxlint"], rootFiles: [] });
			} catch (e) {
				return e;
			}
		})();
		expect((err as Error).message).toMatch(/unknown linters "biome", "oxlint"/);
	});

	it("returns the LinterDef alongside each name", () => {
		const [first] = resolveLinters({ explicit: ["prettier"], rootFiles: [] });
		expect(first!.def.localBin).toBe("prettier");
		expect(first!.def.validate).toContain("VALIDATE_TYPESCRIPT_PRETTIER");
	});
});
