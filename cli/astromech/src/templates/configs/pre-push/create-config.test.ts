import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("pre-push createConfig", () => {
	it("starts with the shebang on line 1", () => {
		expect(createConfig()).toMatch(/^#!/);
		expect(createConfig().split("\n")[0]).toBe("#!/bin/sh");
	});

	it("includes the auto-generated header after the shebang", () => {
		const out = createConfig();
		expect(out).toContain("AUTO-GENERATED — do not edit directly");
		const shebangLine = out.indexOf("#!/bin/sh");
		const headerLine = out.indexOf("# AUTO-GENERATED");
		expect(headerLine).toBeGreaterThan(shebangLine);
	});

	it("runs `holocron run ci` via the default script", () => {
		expect(createConfig()).toContain("pnpm exec holocron run ci");
	});

	it("substitutes a custom holocron script", () => {
		expect(createConfig("node packages/cli/dist/cli.mjs")).toContain("node packages/cli/dist/cli.mjs run ci");
		expect(createConfig("node packages/cli/dist/cli.mjs")).not.toContain("__HOLOCRON_SCRIPT__");
	});

	it("documents the --no-verify bypass", () => {
		expect(createConfig()).toContain("git push --no-verify");
	});

	it("no-ops in CI (before invoking holocron)", () => {
		const out = createConfig();
		expect(out).toContain('[ -n "$CI" ] && exit 0');
		expect(out.indexOf('"$CI"')).toBeLessThan(out.indexOf("holocron run ci"));
	});

	describe("an unbuilt CLI (#1104)", () => {
		const roots: string[] = [];
		afterEach(() => {
			for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
		});

		/** A directory shaped like a linked worktree (`.git` is a file), with the hook written into it. */
		const worktree = (script: string, built: boolean) => {
			const root = mkdtempSync(join(tmpdir(), "pre-push-"));
			roots.push(root);
			writeFileSync(join(root, ".git"), "gitdir: /elsewhere/.git/worktrees/x\n");
			writeFileSync(join(root, "pre-push"), createConfig(script));
			if (built) {
				mkdirSync(join(root, "cli/cli/dist"), { recursive: true });
				writeFileSync(
					join(root, "cli/cli/dist/cli.mjs"),
					"console.log('ran', process.argv.slice(2).join(' '));\n"
				);
			}
			return root;
		};
		const run = (root: string, env: Record<string, string> = {}) =>
			spawnSync("sh", [join(root, "pre-push")], {
				cwd: root,
				encoding: "utf8",
				env: { PATH: process.env.PATH ?? "", ...env },
			});

		it("stops with a message that says to build, not a module-not-found stack", () => {
			const result = run(worktree("node cli/cli/dist/cli.mjs", false));
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("cli/cli/dist/cli.mjs is not built yet");
			expect(result.stderr).toContain("pnpm install && pnpm build");
			expect(result.stderr).toContain("--no-verify");
			expect(result.stderr).not.toContain("Cannot find module");
		});

		it("runs the checks once the CLI is built", () => {
			const result = run(worktree("node cli/cli/dist/cli.mjs", true));
			expect(result.status).toBe(0);
			expect(result.stdout).toContain("ran run ci");
		});

		it("still no-ops in CI before it looks for the build", () => {
			const result = run(worktree("node cli/cli/dist/cli.mjs", false), { CI: "true" });
			expect(result.status).toBe(0);
			expect(result.stderr).toBe("");
		});

		it("adds no check for a script that is not a built file", () => {
			expect(createConfig("pnpm exec holocron")).not.toContain("is not built yet");
			expect(createConfig()).not.toContain("__BUILD_CHECK__");
		});
	});
});
