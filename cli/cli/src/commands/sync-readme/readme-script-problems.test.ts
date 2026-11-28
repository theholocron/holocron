import { describe, expect, it } from "vitest";

import { readmeScriptProblems } from "./readme-script-problems.js";

describe("readmeScriptProblems", () => {
	it("is empty when every script the README names exists", () => {
		expect(
			readmeScriptProblems("Run `pnpm test` then `pnpm test:unit` or `pnpm run build`.", {
				test: "turbo run test",
				"test:unit": "vitest run",
				build: "tsdown",
			})
		).toEqual([]);
	});

	it("names a task script the README tells the reader to run and the package lacks, once", () => {
		const problems = readmeScriptProblems("pnpm test\n\n```sh\npnpm test\npnpm run lint:code\n```", { build: "x" });
		expect(problems).toEqual([
			'README.md tells the reader to run `pnpm test`, but package.json has no "test" script',
			'README.md tells the reader to run `pnpm lint:code`, but package.json has no "lint:code" script',
		]);
	});

	it("counts a suite and a hyphen compound in its script spelling, and an old name", () => {
		expect(readmeScriptProblems("pnpm lint, pnpm deploy:preview, pnpm verification.unitTests", {})).toHaveLength(3);
	});

	it("ignores pnpm's own commands and words that are not tasks", () => {
		expect(readmeScriptProblems("pnpm install, pnpm add -D x, pnpm exec tsx, pnpm dlx y, pnpm", {})).toEqual([]);
	});

	it("reads `pnpm deploy` as pnpm's command, but `pnpm run deploy` as the script", () => {
		expect(readmeScriptProblems("pnpm deploy", {})).toEqual([]);
		expect(readmeScriptProblems("pnpm run deploy", {})).toHaveLength(1);
		expect(readmeScriptProblems("pnpm run deploy", { deploy: "wrangler deploy" })).toEqual([]);
	});
});
