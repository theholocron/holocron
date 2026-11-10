import { Notice, Platform, Plugin, type TFile } from "obsidian";

import { fileIdea } from "./filing/file-idea.js";
import { readSystem } from "./node/read-system.js";
import { runCommand } from "./node/run-command.js";
import { DEFAULT_SETTINGS } from "./settings/default-settings.js";
import { parseStates } from "./settings/parse-states.js";
import type { IdeasSettings } from "./settings/settings.type.js";
import { IdeasSettingTab } from "./settings/settings-tab.js";
import { StatusModal } from "./status-modal.js";

/**
 * The Holocron Council plugin: **File this idea** and **Set idea status**. It is a thin layer over Obsidian's API; the
 * decisions are in `filing/` and `frontmatter/`.
 */
export default class HolocronIdeasPlugin extends Plugin {
	settings: IdeasSettings = { ...DEFAULT_SETTINGS };

	/** Loads the settings and registers the commands, the ribbon button and the settings tab. */
	async onload(): Promise<void> {
		await this.loadSettings();
		this.addRibbonIcon("file-input", "File this idea", () => void this.fileActiveNote());
		this.addCommand({ id: "file-idea", name: "File this idea", callback: () => void this.fileActiveNote() });
		this.addCommand({ id: "set-idea-status", name: "Set idea status", callback: () => this.pickStatus() });
		this.addSettingTab(new IdeasSettingTab(this.app, this));
	}

	/** Reads `data.json` over the defaults. */
	async loadSettings(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<IdeasSettings> | null) };
	}

	/** Writes `data.json`. */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private activeNote(): TFile | undefined {
		const file = this.app.workspace.getActiveFile();
		if (file?.extension !== "md") {
			new Notice("Open an idea note first.");
			return undefined;
		}
		return file;
	}

	private async setStatus(file: TFile, state: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter.status = state;
		});
	}

	private pickStatus(): void {
		const file = this.activeNote();
		if (file === undefined) return;
		new StatusModal(this.app, parseStates(this.settings).states, (state) => {
			void this.setStatus(file, state).then(() => new Notice(`Status: ${state}`));
		}).open();
	}

	private async fileActiveNote(): Promise<void> {
		const file = this.activeNote();
		if (file === undefined) return;
		const adapter = this.app.vault.adapter as { getBasePath?: () => string };
		try {
			await fileIdea({
				settings: this.settings,
				vaultPath: adapter.getBasePath?.(),
				isMobile: Platform.isMobile,
				currentPath: Platform.isMobile ? "" : (process.env.PATH ?? ""),
				system: readSystem,
				readNote: () => this.app.vault.read(file),
				setStatus: (state) => this.setStatus(file, state),
				trashNote: () => this.app.fileManager.trashFile(file),
				run: runCommand,
				notify: (message) => new Notice(message, 10_000),
				announce: (message) => new Notice(message, 6000),
			});
		} catch (error) {
			new Notice(
				`Not filed; the note was kept. ${error instanceof Error ? error.message : String(error)}`,
				10_000
			);
		}
	}
}
