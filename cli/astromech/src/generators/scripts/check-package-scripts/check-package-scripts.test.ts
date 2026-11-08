import { describe, expect, it } from "vitest";

import { checkPackageScripts } from "./check-package-scripts.js";

const fails = (scripts: Record<string, string>, role: "root" | "package") =>
	checkPackageScripts(scripts, role)
		.filter((p) => p.level === "fail")
		.map((p) => p.script);

describe("checkPackageScripts", () => {
	it("accepts a package of flat leaves, a dev script and a variant", () => {
		expect(
			checkPackageScripts(
				{
					build: "tsdown",
					"test:unit": "vitest run --coverage",
					"test:watch": "vitest",
					dev: "astro dev",
					"lint:fix": "eslint --fix .",
				},
				"package"
			)
		).toEqual([]);
	});

	it("fails a name npm and pnpm give a meaning of their own, except the root's prepare", () => {
		expect(fails({ publish: "x", install: "y", prepare: "husky" }, "package")).toEqual([
			"publish",
			"install",
			"prepare",
		]);
		expect(fails({ publish: "x", prepare: "husky" }, "root")).toEqual(["publish"]);
	});

	it("fails a script named like a suite in a package, but not at the root", () => {
		const problems = checkPackageScripts({ test: "vitest", lint: "eslint ." }, "package");
		expect(problems.map((p) => p.script)).toEqual(["test", "lint"]);
		expect(problems[0]!.message).toMatch(/test:unit, test:visual, test:perf/);
		expect(checkPackageScripts({ test: "turbo run test" }, "root")).toEqual([]);
	});

	it("fails a script named by a task id's hyphen spelling, which `holocron run` would never find (#1929)", () => {
		const problems = checkPackageScripts({ "deploy-preview": "vercel deploy", "deploy:preview": "ok" }, "package");
		expect(problems.map((p) => p.script)).toEqual(["deploy-preview"]);
		expect(problems[0]!.message).toMatch(/named "deploy:preview"/);
		expect(fails({ "check-tokens": "x", deploy: "y", "reconcile-projects": "z" }, "root")).toEqual([
			"check-tokens",
			"reconcile-projects",
		]);
	});

	it("fails a leaf that hands the work back to turbo or the CLI, in a package only", () => {
		expect(fails({ "test:unit": "turbo run test:unit", build: "holocron run build --" }, "package")).toEqual([
			"test:unit",
			"build",
		]);
		expect(fails({ "test:unit": "turbo run test:unit", build: "holocron run build --" }, "root")).toEqual([]);
		expect(checkPackageScripts({ build: "turbo run build" }, "package")[0]!.message).toMatch(
			/not a call to `turbo run`/
		);
	});

	it("does not mind a script that is not a task calling turbo", () => {
		expect(checkPackageScripts({ deps: "turbo run x", "docs:build": "turbo run y" }, "package")).toEqual([]);
	});

	it("warns, but does not fail, on an old dotted name", () => {
		const problems = checkPackageScripts({ "verification.unitTests": "vitest run" }, "package");
		expect(problems).toEqual([
			{
				level: "warn",
				script: "verification.unitTests",
				message: '"verification.unitTests" is a deprecated task name: use test:unit',
			},
		]);
	});

	it("fails a script that looks like a suite member but is none, so `test:unt` is caught", () => {
		const problems = checkPackageScripts({ "test:unt": "vitest run" }, "package");
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatchObject({ level: "fail", script: "test:unt" });
		expect(problems[0]!.message).toMatch(/member of the test suite/);
	});

	it("leaves a colon script that is not under a suite alone", () => {
		expect(
			checkPackageScripts(
				{ "docs:dev": "astro dev", "validate:plugin": "node x.mjs", "deploy:plugin": "tsx x" },
				"package"
			)
		).toEqual([]);
	});
});
