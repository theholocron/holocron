import { beforeEach, describe, expect, it, vi } from "vitest";

import { notices, Platform, settingRows } from "./__tests__/obsidian-mock.js";

vi.mock("obsidian", async () => await import("./__tests__/obsidian-mock.js"));
const { runCommand } = vi.hoisted(() => ({ runCommand: vi.fn() }));
vi.mock("./node/run-command.js", () => ({ runCommand }));

const { default: HolocronIdeasPlugin } = await import("./main.js");
const { IdeasSettingTab } = await import("./settings/settings-tab.js");
const { StatusModal } = await import("./status-modal.js");

const FILED = "---\nstatus: in-progress\nissue: '#7'\n---\n";

interface Harness {
	plugin: InstanceType<typeof HolocronIdeasPlugin>;
	frontmatter: Record<string, unknown>;
	trashed: unknown[];
	text: { value: string };
}

function harness(options: { active?: unknown; basePath?: string } = {}): Harness {
	const frontmatter: Record<string, unknown> = {};
	const trashed: unknown[] = [];
	const text = { value: FILED };
	const file = "active" in options ? options.active : { extension: "md", path: "idea.md" };
	const plugin = new HolocronIdeasPlugin(undefined as never, undefined as never);
	(plugin as unknown as { app: unknown }).app = {
		workspace: { getActiveFile: () => file },
		vault: {
			read: () => Promise.resolve(text.value),
			adapter: { getBasePath: () => options.basePath },
		},
		fileManager: {
			processFrontMatter: (_file: unknown, edit: (fm: Record<string, unknown>) => void) => {
				edit(frontmatter);
				return Promise.resolve();
			},
			trashFile: (f: unknown) => {
				trashed.push(f);
				return Promise.resolve();
			},
		},
	};
	return { plugin, frontmatter, trashed, text };
}

type Registered = {
	commands: { id: string; callback: () => void }[];
	ribbon: { callback: () => void }[];
	tabs: unknown[];
};

beforeEach(() => {
	notices.length = 0;
	settingRows.length = 0;
	Platform.isMobile = false;
});

describe("HolocronIdeasPlugin", () => {
	it("registers both commands, the ribbon button and the settings tab", async () => {
		const { plugin } = harness();
		await plugin.onload();
		const registered = plugin as unknown as Registered;
		expect(registered.commands.map((c) => c.id)).toEqual(["file-idea", "set-idea-status"]);
		expect(registered.ribbon).toHaveLength(1);
		expect(registered.tabs[0]).toBeInstanceOf(IdeasSettingTab);
	});

	it("loads saved settings over the defaults and saves them", async () => {
		const { plugin } = harness();
		(plugin as unknown as { stored: unknown }).stored = { repoPath: "/repo" };
		await plugin.loadSettings();
		// a data.json saved before the shell option existed picks up its default
		expect(plugin.settings).toMatchObject({
			repoPath: "/repo",
			command: "pnpm exec holocron",
			useLoginShell: true,
		});
		await plugin.saveSettings();
		expect((plugin as unknown as { saved: unknown }).saved).toBe(plugin.settings);
	});

	it("falls back to the defaults when nothing was saved", async () => {
		const { plugin } = harness();
		await plugin.loadSettings();
		expect(plugin.settings.fileState).toBe("in-progress");
	});

	it("asks for a note when none is open", async () => {
		const { plugin } = harness({ active: null });
		await plugin.onload();
		const { commands, ribbon } = plugin as unknown as Registered;
		commands[0]?.callback();
		commands[1]?.callback();
		ribbon[0]?.callback();
		await Promise.resolve();
		expect(notices.map((n) => n.message)).toEqual(Array(3).fill("Open an idea note first."));
	});

	it("File this idea on mobile sets the state and tells the user", async () => {
		Platform.isMobile = true;
		const { plugin, frontmatter, text } = harness();
		text.value = "---\nstatus: seed\n---\n";
		await plugin.onload();
		(plugin as unknown as Registered).commands[0]?.callback();
		await vi.waitFor(() => expect(notices).toHaveLength(1));
		expect(frontmatter.status).toBe("in-progress");
		expect(notices[0]?.message).toContain("next time a Mac");
	});

	it("File this idea refuses a note that is already filed", async () => {
		const { plugin, frontmatter } = harness();
		await plugin.onload();
		(plugin as unknown as Registered).ribbon[0]?.callback();
		await vi.waitFor(() => expect(notices).toHaveLength(1));
		expect(frontmatter.status).toBeUndefined();
		expect(notices[0]?.message).toContain("already filed");
	});

	it("File this idea on desktop reports a missing repo path", async () => {
		const { plugin } = harness({ basePath: "/vault" });
		await plugin.onload();
		const reads = vi.spyOn(plugin.app.vault, "read").mockResolvedValue("---\nstatus: seed\n---\n");
		(plugin as unknown as Registered).commands[0]?.callback();
		await vi.waitFor(() => expect(notices).toHaveLength(1));
		expect(reads).toHaveBeenCalled();
		expect(notices[0]?.message).toContain("repo path");
	});

	it("File this idea on desktop runs the sync with the vault and trashes the filed note", async () => {
		const { plugin, trashed } = harness({ basePath: "/vault" });
		await plugin.onload();
		plugin.settings.repoPath = "/repo";
		const reads = ["---\nstatus: seed\n---\n", FILED];
		vi.spyOn(plugin.app.vault, "read").mockImplementation(() => Promise.resolve(reads.shift() ?? FILED));
		runCommand.mockResolvedValue({ code: 0, output: "1 filed" });
		const savedPath = process.env.PATH;
		delete process.env.PATH;
		(plugin as unknown as Registered).commands[0]?.callback();
		await vi.waitFor(() => expect(notices).toHaveLength(2));
		expect(runCommand).toHaveBeenCalledWith(
			expect.objectContaining({ cwd: "/repo", env: expect.objectContaining({ HOLOCRON_IDEAS_DIR: "/vault" }) })
		);
		process.env.PATH = savedPath;
		expect(trashed).toHaveLength(1);
		expect(notices[0]?.message).toContain("starting your shell can take a few seconds");
		expect(notices[0]?.duration).toBe(6000);
		expect(notices[1]?.message).toContain("Filed as #7");
	});

	it("shows an error as a notice and keeps the note", async () => {
		const { plugin, trashed } = harness();
		await plugin.onload();
		vi.spyOn(plugin.app.vault, "read").mockRejectedValue(new Error("disk gone"));
		(plugin as unknown as Registered).commands[0]?.callback();
		await vi.waitFor(() => expect(notices).toHaveLength(1));
		expect(notices[0]?.message).toContain("disk gone");
		vi.spyOn(plugin.app.vault, "read").mockRejectedValue("text");
		(plugin as unknown as Registered).commands[0]?.callback();
		await vi.waitFor(() => expect(notices).toHaveLength(2));
		expect(notices[1]?.message).toContain("text");
		expect(trashed).toEqual([]);
	});

	it("Set idea status opens the picker and sets the chosen state", async () => {
		const { plugin, frontmatter } = harness();
		await plugin.onload();
		const opened: unknown[] = [];
		vi.spyOn(StatusModal.prototype, "open").mockImplementation(function (this: unknown) {
			opened.push(this);
		});
		(plugin as unknown as Registered).commands[1]?.callback();
		const modal = opened[0] as InstanceType<typeof StatusModal>;
		expect(modal.getSuggestions("")).toEqual(["seed", "exploring", "in-progress", "dropped"]);
		modal.onChooseSuggestion("exploring");
		await vi.waitFor(() => expect(notices).toHaveLength(1));
		expect(frontmatter.status).toBe("exploring");
		expect(notices[0]?.message).toBe("Status: exploring");
	});
});
