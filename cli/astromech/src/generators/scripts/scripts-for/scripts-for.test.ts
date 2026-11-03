import { describe, expect, it } from "vitest";

import { scriptsFor } from "./scripts-for.js";

const MONOREPO = { monorepo: true };

describe("scriptsFor in a monorepo", () => {
	const scripts = scriptsFor(
		{
			tasks: [
				"build",
				"typecheck",
				"test:unit",
				"lint:code",
				"lint:markdown",
				"lint:editorconfig",
				"lint:unused",
				"lint:commits",
				"scan:secrets",
				"scan:code",
				"format",
				"release",
				"validate",
				"sync-repo",
				"deploy",
			],
		},
		undefined,
		MONOREPO
	);

	it("calls turbo for a package-scoped leaf, under its flat id", () => {
		expect(scripts["build"]).toBe("turbo run build");
		expect(scripts["typecheck"]).toBe("turbo run typecheck");
		expect(scripts["test:unit"]).toBe("turbo run test:unit");
		expect(scripts["lint:code"]).toBe("turbo run lint:code");
	});

	it("holds the tool's own command for a repo-scoped leaf, so it does not call itself", () => {
		expect(scripts["lint:markdown"]).toBe('markdownlint-cli2 "**/*.md"');
		expect(scripts["lint:editorconfig"]).toBe("editorconfig-checker");
		expect(scripts["lint:unused"]).toBe("knip");
		expect(scripts["scan:secrets"]).toBe("gitleaks dir --no-banner --config .gitleaks.toml");
		expect(scripts["format"]).toBe("prettier --write .");
	});

	it("calls turbo for each suite that has a leaf with a script", () => {
		expect(scripts["test"]).toBe("turbo run test");
		expect(scripts["lint"]).toBe("turbo run lint");
		expect(scripts["scan"]).toBe("turbo run scan");
	});

	it("writes nothing for a leaf with no local command", () => {
		for (const name of ["lint:commits", "scan:code", "release", "validate", "sync-repo", "deploy"]) {
			expect(scripts).not.toHaveProperty(name);
		}
	});

	it("leaves out a suite none of whose configured leaves has a script", () => {
		expect(scriptsFor({ tasks: ["lint:commits", "scan:code"] }, undefined, MONOREPO)).toEqual({});
	});

	it("leaves out a task switched off for local runs", () => {
		expect(scriptsFor({ tasks: [{ name: "typecheck", local: false }] }, undefined, MONOREPO)).toEqual({});
	});

	it("calls turbo with the key the manifest entry spells, but names the root script by the flat id", () => {
		const legacy = scriptsFor(
			{ tasks: ["verification.unitTests", "sourceQuality.staticAnalysis", "sourceQuality.formatting"] },
			undefined,
			MONOREPO
		);
		expect(legacy).toEqual({
			"test:unit": "turbo run verification.unitTests",
			"lint:code": "turbo run sourceQuality.staticAnalysis",
			"lint:editorconfig": "editorconfig-checker",
			"lint:markdown": 'markdownlint-cli2 "**/*.md"',
			format: "prettier --write .",
			test: "turbo run test",
			lint: "turbo run lint",
		});
	});
});

describe("scriptsFor in a single package", () => {
	it("wraps `holocron run` for every task it can run, with the qualifier as a second word", () => {
		expect(
			scriptsFor({ tasks: ["test:unit", "lint:code", "lint:commits", "format", "typecheck", "scan:code"] })
		).toEqual({
			"test:unit": "holocron run test unit --",
			test: "holocron run test --",
			"lint:code": "holocron run lint code --",
			"lint:commits": "holocron run lint commits --",
			lint: "holocron run lint --",
			format: "holocron run format --",
			typecheck: "holocron run typecheck --",
		});
	});

	it("names a hyphen compound by its script spelling and keeps its hyphen in the task", () => {
		expect(scriptsFor({ tasks: ["sync-repo"] })).toEqual({ "sync:repo": "holocron run sync-repo --" });
	});

	it("keeps an old dotted name's script as it was, with no suite script", () => {
		expect(scriptsFor({ tasks: ["verification.unitTests", "sourceQuality.formatting"] })).toEqual({
			"verification.unitTests": "holocron run verification.unitTests --",
			"sourceQuality.formatting": "holocron run sourceQuality.formatting --",
		});
	});

	it("writes a suite script for a flat member listed next to an old name", () => {
		const scripts = scriptsFor({ tasks: ["verification.unitTests", "lint:code"] });
		expect(Object.keys(scripts).sort()).toEqual(["lint", "lint:code", "verification.unitTests"]);
	});

	it("is empty with no manifest", () => {
		expect(scriptsFor({})).toEqual({});
	});
});
