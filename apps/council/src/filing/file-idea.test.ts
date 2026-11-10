import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "../settings/default-settings.js";
import { fileIdea } from "./file-idea.js";
import type { FileIdeaDeps, RunResult } from "./filing.type.js";

const SEED = "---\nstatus: seed\n---\nbody";
const FILED = "---\nstatus: in-progress\nissue: '#7'\n---\nbody";

/** Deps with a log of the order things happen in; `reads` are the texts returned by successive reads. */
function setup(overrides: Partial<FileIdeaDeps> = {}, reads: string[] = [SEED, FILED], run?: RunResult) {
	const log: string[] = [];
	const notices: string[] = [];
	const queue = [...reads];
	const deps: FileIdeaDeps = {
		settings: { ...DEFAULT_SETTINGS, repoPath: "/repo" },
		vaultPath: "/vault",
		isMobile: false,
		currentPath: "/bin",
		system: () => ({ home: "/Users/me", shell: "/bin/zsh" }),
		readNote: () => {
			log.push("read");
			return Promise.resolve(queue.shift() ?? "");
		},
		setStatus: (state) => {
			log.push(`status:${state}`);
			return Promise.resolve();
		},
		trashNote: () => {
			log.push("trash");
			return Promise.resolve();
		},
		run: vi.fn(() => {
			log.push("run");
			return Promise.resolve(run ?? { code: 0, output: "1 filed" });
		}),
		notify: (message) => notices.push(message),
		announce: () => log.push("announce"),
		...overrides,
	};
	return { deps, log, notices };
}

describe("fileIdea", () => {
	it("sets the state, runs the sync, reads the note again and only then trashes it", async () => {
		const { deps, log, notices } = setup();
		await fileIdea(deps);
		expect(log).toEqual(["read", "status:in-progress", "announce", "run", "read", "trash"]);
		expect(notices).toEqual(["Filed as #7; the note is in the trash."]);
		expect(deps.run).toHaveBeenCalledWith(
			expect.objectContaining({
				program: "/bin/zsh",
				cwd: "/repo",
				args: expect.arrayContaining(["ideas", "sync", "--yes"]),
			})
		);
	});

	it("says once that an unsupported login shell was skipped and runs the command directly", async () => {
		const { deps, notices } = setup({ system: () => ({ home: "/Users/me", shell: "/opt/homebrew/bin/fish" }) });
		await fileIdea(deps);
		expect(notices).toHaveLength(2);
		expect(notices[0]).toContain("login shell (fish) is not supported");
		expect(notices[0]).toContain("full paths");
		expect(deps.run).toHaveBeenCalledWith(expect.objectContaining({ program: "pnpm" }));
	});

	it("refuses a note that is already filed and changes nothing", async () => {
		const { deps, log, notices } = setup({}, [FILED]);
		await fileIdea(deps);
		expect(log).toEqual(["read"]);
		expect(notices[0]).toContain("already filed");
	});

	it("on mobile only sets the state", async () => {
		const { deps, log, notices } = setup({ isMobile: true });
		await fileIdea(deps);
		expect(log).toEqual(["read", "status:in-progress"]);
		expect(notices[0]).toContain("next time a Mac");
	});

	it.each([
		["no repo path", { settings: { ...DEFAULT_SETTINGS, repoPath: " " } }, "repo path"],
		["no local vault", { vaultPath: undefined }, "not a folder"],
		[
			"an empty command",
			{ settings: { ...DEFAULT_SETTINGS, repoPath: "/r", command: "" } },
			"command setting is empty",
		],
	])("touches nothing with %s", async (_name, overrides, text) => {
		const { deps, log, notices } = setup(overrides);
		await fileIdea(deps);
		expect(log).toEqual(["read"]);
		expect(notices[0]).toContain(text);
	});

	it("never trashes after a non-zero exit, even if the note has an issue", async () => {
		const { deps, log, notices } = setup({}, [SEED, FILED], { code: 1, output: "boom\nlast line" });
		await fileIdea(deps);
		expect(log).toEqual(["read", "status:in-progress", "announce", "run"]);
		expect(notices[0]).toContain("exited with 1");
		expect(notices[0]).toContain("last line");
	});

	it("reports why a command did not start", async () => {
		const { deps, log, notices } = setup({}, [SEED], { code: null, output: "", error: "spawn pnpm ENOENT" });
		await fileIdea(deps);
		expect(log).not.toContain("trash");
		expect(notices[0]).toBe("Not filed; the note was kept. spawn pnpm ENOENT");
	});

	it("keeps a note that still has no issue and shows the command's output", async () => {
		const { deps, log, notices } = setup({}, [SEED, SEED], { code: 0, output: "skipped: attachment" });
		await fileIdea(deps);
		expect(log).toEqual(["read", "status:in-progress", "announce", "run", "read"]);
		expect(notices[0]).toContain("skipped: attachment");
	});
});
