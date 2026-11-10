import { describe, expect, it } from "vitest";

import { buildSyncCommand, FALLBACK_PATH, shellQuote } from "./build-sync-command.js";

const system = { home: "/Users/me", shell: "/bin/zsh" };
const direct = { useLoginShell: false };
const viaShell = { useLoginShell: true };

describe("buildSyncCommand without the login shell", () => {
	it("builds the sync line, the vault variable and a PATH with fallbacks, and no token", () => {
		const command = buildSyncCommand(
			{ ...direct, command: "pnpm exec holocron", repoPath: " /repo " },
			"/vault",
			"/usr/sbin",
			system
		);
		expect(command).toEqual({
			program: "pnpm",
			args: ["exec", "holocron", "ideas", "sync", "--yes"],
			cwd: "/repo",
			env: { HOLOCRON_IDEAS_DIR: "/vault", PATH: `/usr/sbin:${FALLBACK_PATH.join(":")}` },
		});
	});

	it("expands ~ in the repo path and in a command word", () => {
		const command = buildSyncCommand(
			{ ...direct, command: "~/bin/pnpm exec holocron", repoPath: "~/Code/holocron" },
			"/v",
			"",
			system
		);
		expect(command?.program).toBe("/Users/me/bin/pnpm");
		expect(command?.cwd).toBe("/Users/me/Code/holocron");
	});

	it("leaves out an empty current PATH", () => {
		expect(buildSyncCommand({ ...direct, command: "holocron", repoPath: "/r" }, "/v", "", system)?.env.PATH).toBe(
			FALLBACK_PATH.join(":")
		);
	});

	it("returns undefined for an empty command", () => {
		expect(buildSyncCommand({ ...direct, command: " ", repoPath: "/r" }, "/v", "", system)).toBeUndefined();
	});
});

describe("buildSyncCommand through the login shell", () => {
	it("starts the shell with -ilc, quotes every word and passes the sync words as arguments", () => {
		const command = buildSyncCommand(
			{ ...viaShell, command: "pnpm exec holocron", repoPath: "~/Code/holocron" },
			"/vault",
			"/usr/sbin",
			{ home: "/Users/me", shell: "/bin/bash" }
		);
		expect(command).toEqual({
			program: "/bin/bash",
			args: [
				"-ilc",
				`cd -- '/Users/me/Code/holocron' && 'pnpm' 'exec' 'holocron' "$@"`,
				"holocron",
				"ideas",
				"sync",
				"--yes",
			],
			cwd: "/Users/me/Code/holocron",
			env: { HOLOCRON_IDEAS_DIR: "/vault", PATH: `/usr/sbin:${FALLBACK_PATH.join(":")}` },
		});
	});

	it("quotes a word with a space and a single quote, and expands a ~ word first", () => {
		const command = buildSyncCommand(
			{ ...viaShell, command: `"~/My Tools/pnpm" exec "it's"`, repoPath: "/r" },
			"/v",
			"",
			system
		);
		expect(command?.args[1]).toBe(`cd -- '/r' && '/Users/me/My Tools/pnpm' 'exec' 'it'\\''s' "$@"`);
	});

	it("moves to the checkout first, quoting a repo path with a space and a quote", () => {
		const command = buildSyncCommand(
			{ ...viaShell, command: "holocron", repoPath: "~/My Code/it's" },
			"/v",
			"",
			system
		);
		expect(command?.args[1]).toBe(`cd -- '/Users/me/My Code/it'\\''s' && 'holocron' "$@"`);
		expect(command?.cwd).toBe("/Users/me/My Code/it's");
	});

	it.each(["sh", "bash", "zsh", "dash", "ksh"])("uses the login shell for %s", (name) => {
		const command = buildSyncCommand({ ...viaShell, command: "holocron", repoPath: "/r" }, "/v", "", {
			home: "/h",
			shell: `/bin/${name}`,
		});
		expect(command?.program).toBe(`/bin/${name}`);
		expect(command?.unsupportedShell).toBeUndefined();
	});

	it.each(["/opt/homebrew/bin/fish", "/usr/local/bin/nu", "/bin/mystery"])(
		"runs directly and reports a shell outside the POSIX family: %s",
		(shell) => {
			const command = buildSyncCommand(
				{ ...viaShell, command: "~/bin/pnpm exec holocron", repoPath: "~/r" },
				"/v",
				"",
				{ home: "/h", shell }
			);
			expect(command).toMatchObject({
				program: "/h/bin/pnpm",
				args: ["exec", "holocron", "ideas", "sync", "--yes"],
				cwd: "/h/r",
				unsupportedShell: shell.split("/").pop(),
			});
		}
	);

	it("returns undefined for an empty command", () => {
		expect(buildSyncCommand({ ...viaShell, command: "", repoPath: "/r" }, "/v", "", system)).toBeUndefined();
	});
});

describe("shellQuote", () => {
	it("wraps in single quotes and escapes a single quote", () => {
		expect(shellQuote("a b")).toBe("'a b'");
		expect(shellQuote("a'b")).toBe(`'a'\\''b'`);
	});
});
