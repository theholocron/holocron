import { vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../../config/index.js";
import {
	type BoardState,
	type BoardSummary,
	type PluginImporter,
	PluginLoader,
	type Projects,
} from "../../../plugin/index.js";
import type { TemplatesIo } from "../load-templates/index.js";

type Raw = Parameters<typeof resolveConfig>[0];

/** A config with the given providers, resolved. */
export const loadedWith = (providers: Record<string, unknown>, extra: Record<string, unknown> = {}): LoadedConfig => ({
	resolved: resolveConfig({ name: "demo", org: "acme", providers, ...extra } as Raw),
	filepath: "/tmp/test/holocron.config.json",
});

const PACKAGES: Record<string, string> = { projects: "github", notifications: "discord" };

/** A real loader over fake plugin packages, one per provider, exposing the capabilities the test gives it. */
export function loaderWith(loaded: LoadedConfig, caps: Record<string, unknown>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		const keys = Object.keys(caps).filter((k) => pkg === `@theholocron/holocron-plugin-${PACKAGES[k]}`);
		if (keys.length === 0) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return {
			createPlugin: () => ({
				name: pkg,
				capabilities: Object.fromEntries(keys.map((k) => [k, () => caps[k]])),
			}),
		} as unknown as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

/** A template directory held in memory. */
export const memoryIo = (files: Record<string, string> = {}): TemplatesIo => ({
	listFiles: async () => Object.keys(files),
	readFile: async (path) => files[path.split("/").pop() as string] as string,
});

export const board = (name: string, over: Partial<BoardSummary> = {}): BoardSummary => ({
	id: `id-${name}`,
	number: 1,
	name,
	url: `https://example.test/${name}`,
	closed: false,
	...over,
});

/** The live state of a board that matches the built-in `roadmap` template. */
export const roadmapState = (summary: BoardSummary, over: Partial<BoardState> = {}): BoardState => ({
	board: summary,
	statuses: ["Someday", "Todo", "In Progress", "Blocked", "Done"],
	fields: [
		{ name: "Priority", type: "single_select", options: ["1 · Now", "2 · Next", "3 · Process"] },
		{ name: "Milestone", type: "text" },
	],
	views: [
		{ name: "Active", layout: "board", filter: "-status:Someday -status:Done", default: true },
		{ name: "Backlog", layout: "board", filter: "status:Someday" },
		{ name: "Done", layout: "table", filter: "status:Done" },
	],
	rules: [{ name: "Auto-add sub-issues to project", enabled: true }],
	...over,
});

/** A `Projects` provider whose methods are spies; the test overrides what it cares about. */
export const fakeProjects = (over: Partial<Projects> = {}): Projects =>
	({
		key: "projects",
		providerName: "github",
		list: vi.fn(async () => []),
		find: vi.fn(async () => undefined),
		create: vi.fn(),
		close: vi.fn(),
		read: vi.fn(),
		...over,
	}) as unknown as Projects;
