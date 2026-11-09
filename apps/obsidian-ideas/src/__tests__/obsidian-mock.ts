/** A stand-in for the `obsidian` module, which has no runtime of its own outside the app. Used with `vi.mock("obsidian", ...)`. */
import { vi } from "vitest";

export const notices: { message: string; duration?: number }[] = [];
export const Platform = { isMobile: false };

export class Notice {
	constructor(message: string, duration?: number) {
		notices.push({ message, duration });
	}
}

export class Plugin {
	commands: { id: string; name: string; callback: () => void }[] = [];
	ribbon: { icon: string; title: string; callback: () => void }[] = [];
	tabs: unknown[] = [];
	stored: unknown = null;
	saved: unknown;
	app: unknown;
	addCommand(command: { id: string; name: string; callback: () => void }): void {
		this.commands.push(command);
	}
	addRibbonIcon(icon: string, title: string, callback: () => void): void {
		this.ribbon.push({ icon, title, callback });
	}
	addSettingTab(tab: unknown): void {
		this.tabs.push(tab);
	}
	loadData(): Promise<unknown> {
		return Promise.resolve(this.stored);
	}
	saveData(data: unknown): Promise<void> {
		this.saved = data;
		return Promise.resolve();
	}
}

export class PluginSettingTab {
	containerEl = {
		empty: vi.fn(),
		createEl: vi.fn(),
	};
	constructor(
		public app: unknown,
		public plugin: unknown
	) {}
}

export const settingRows: { name?: string; desc?: string; input?: FakeText }[] = [];

export interface FakeText {
	placeholder?: string;
	value?: string;
	onChange?: (value: string) => Promise<void>;
}

export class Setting {
	row: { name?: string; desc?: string; input?: FakeText } = {};
	constructor(_el: unknown) {
		settingRows.push(this.row);
	}
	setName(name: string): this {
		this.row.name = name;
		return this;
	}
	setDesc(desc: string): this {
		this.row.desc = desc;
		return this;
	}
	addText(build: (input: unknown) => void): this {
		const input: FakeText & Record<string, unknown> = {};
		const api = {
			setPlaceholder(value: string) {
				input.placeholder = value;
				return api;
			},
			setValue(value: string) {
				input.value = value;
				return api;
			},
			onChange(handler: (value: string) => Promise<void>) {
				input.onChange = handler;
				return api;
			},
		};
		build(api);
		this.row.input = input;
		return this;
	}
}

export class SuggestModal<T> {
	opened = false;
	placeholder = "";
	constructor(public app: unknown) {}
	setPlaceholder(value: string): void {
		this.placeholder = value;
	}
	open(): void {
		this.opened = true;
	}
	getSuggestions(_query: string): T[] {
		return [];
	}
}
