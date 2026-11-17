import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("prepare-commit-msg createConfig", () => {
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

	it("validates git user.name and user.email", () => {
		const out = createConfig();
		expect(out).toContain("git config user.name");
		expect(out).toContain("git config user.email");
	});

	it("appends the DCO Signed-off-by trailer", () => {
		expect(createConfig()).toContain("Signed-off-by");
	});

	it("runs devmoji", () => {
		expect(createConfig()).toContain("devmoji");
	});

	it("resolves --config against the shared devmoji-config package's built dist when present", () => {
		const out = createConfig();
		expect(out).toContain('DEVMOJI_CONFIG="node_modules/@theholocron/devmoji-config/dist/index.cjs"');
		expect(out).toContain('npx devmoji --config "$DEVMOJI_CONFIG" <"$1"');
	});

	it("falls back to devmoji's own auto-discovery when the shared package isn't installed", () => {
		const out = createConfig();
		expect(out).toMatch(/if \[ -f "\$DEVMOJI_CONFIG" \]; then[\s\S]*else\s*\n\s*npx devmoji <"\$1"/);
	});

	it("never lets devmoji read .git/COMMIT_EDITMSG itself, which is another checkout's file in a worktree (#1104)", () => {
		expect(createConfig()).not.toMatch(/^\s*npx devmoji[^\n]* -e\b/m);
	});

	describe("run from a linked worktree (#1104)", () => {
		const roots: string[] = [];
		afterEach(() => {
			for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
		});

		const env = (root: string) => ({
			PATH: `${root}:${process.env.PATH ?? ""}`,
			GIT_CONFIG_GLOBAL: join(root, "gitconfig"),
			GIT_CONFIG_NOSYSTEM: "1",
		});

		/**
		 * A real repository with a linked worktree (its `.git` is a file), a decoy `.git/COMMIT_EDITMSG` in the main
		 * checkout, a stand-in `npx` that marks what it is given, and a user. The hook runs in the worktree.
		 */
		const setup = () => {
			const root = mkdtempSync(join(tmpdir(), "prepare-commit-msg-"));
			roots.push(root);
			writeFileSync(join(root, "gitconfig"), "[user]\n\tname = Test\n\temail = test@example.com\n");
			writeFileSync(join(root, "npx"), '#!/bin/sh\nsed "s/^/[devmoji] /"\n');
			chmodSync(join(root, "npx"), 0o755);
			writeFileSync(join(root, "hook"), createConfig());
			writeFileSync(join(root, "MSG"), "chore: a change\n");
			const git = (cwd: string, ...args: string[]) =>
				execFileSync("git", args, { cwd, env: env(root), stdio: "pipe" });
			mkdirSync(join(root, "main"));
			git(join(root, "main"), "init", "-q");
			git(join(root, "main"), "commit", "-q", "--allow-empty", "-m", "init");
			git(join(root, "main"), "worktree", "add", "-q", "-b", "wt-branch", join(root, "wt"));
			writeFileSync(join(root, "main", ".git", "COMMIT_EDITMSG"), "decoy from another checkout\n");
			return root;
		};
		const run = (root: string) =>
			spawnSync("sh", [join(root, "hook"), join(root, "MSG")], {
				cwd: join(root, "wt"),
				encoding: "utf8",
				env: env(root),
			});

		it("runs the message git passes through devmoji and writes it back to that file", () => {
			const root = setup();
			const result = run(root);
			expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
			const message = readFileSync(join(root, "MSG"), "utf8");
			expect(message).toContain("[devmoji] chore: a change");
			expect(message).toContain("Signed-off-by: Test <test@example.com>");
		});

		it("leaves the main checkout's COMMIT_EDITMSG alone", () => {
			const root = setup();
			run(root);
			expect(readFileSync(join(root, "main", ".git", "COMMIT_EDITMSG"), "utf8")).toBe(
				"decoy from another checkout\n"
			);
		});

		it("leaves no temporary file behind", () => {
			const root = setup();
			run(root);
			expect(existsSync(join(root, "MSG.devmoji"))).toBe(false);
		});

		it("fails the commit and keeps the message when devmoji fails", () => {
			const root = setup();
			writeFileSync(join(root, "npx"), "#!/bin/sh\nexit 3\n");
			const result = run(root);
			expect(result.status).toBe(1);
			expect(readFileSync(join(root, "MSG"), "utf8")).toContain("chore: a change");
			expect(existsSync(join(root, "MSG.devmoji"))).toBe(false);
		});
	});
});
