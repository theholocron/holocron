/** Test helpers shared by the `holocron project` tests: a loaded config, a loader over a fake `projects` provider, and rows. */

import { basename } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../../config/index.js";
import type { BoardSummary, Projects } from "../../../plugin/index.js";
import { type PluginImporter, PluginLoader } from "../../../plugin/index.js";
import type { TemplatesIo } from "../load-templates/index.js";
import type { ProjectPrompt } from "../terminal-prompt/index.js";

export function board(over: Partial<BoardSummary> = {}): BoardSummary {
	return { id: "PVT_1", number: 7, name: "v5", url: "https://example.test/projects/7", closed: false, ...over };
}

export function loadedWith(providers: Record<string, unknown>, org = "acme"): LoadedConfig {
	return {
		resolved: resolveConfig({ name: "demo", org, providers } as Parameters<typeof resolveConfig>[0]),
		filepath: "/tmp/test/holocron.config.json",
	};
}

/** A `Projects` whose every method is a spy. `over` replaces any of them. */
export function fakeProjects(over: Partial<Record<keyof Projects, unknown>> = {}) {
	return {
		key: "projects",
		providerName: "github",
		list: vi.fn(async () => [] as BoardSummary[]),
		find: vi.fn(async () => undefined as BoardSummary | undefined),
		create: vi.fn(async (_o: string, name: string) => board({ name })),
		close: vi.fn(async () => {}),
		read: vi.fn(),
		ensure: vi.fn(async () => ({ created: false, changes: [], todos: [] })),
		...Object.fromEntries(
			Object.entries(over).map(([k, v]) => [k, typeof v === "function" ? vi.fn(v as never) : v])
		),
	} as unknown as Projects & Record<"list" | "find" | "create" | "close" | "ensure", ReturnType<typeof vi.fn>>;
}

export function loaderFor(loaded: LoadedConfig, projects: unknown): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (pkg !== "@theholocron/holocron-plugin-github") throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return {
			createPlugin: () => ({ name: "github", capabilities: { projects: () => projects } }),
		} as unknown as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

/** A directory of template files held in memory. */
export function memoryIo(files: Record<string, string> = {}): TemplatesIo {
	return {
		listFiles: async () => Object.keys(files),
		readFile: async (path) => files[basename(path)] ?? "",
	};
}

export function promptOf(over: Partial<ProjectPrompt> = {}): ProjectPrompt {
	return {
		interactive: true,
		confirm: vi.fn(async () => true),
		select: vi.fn(async (_m: string, choices: string[]) => choices[0] ?? ""),
		...over,
	};
}

/** The common input: a loader over `projects`, in-memory templates, captured output. */
export function inputFor(
	projects: unknown,
	options: { boards?: { template: string; name: string }[]; dryRun?: boolean } = {}
) {
	const loaded = loadedWith({ projects: ["github", { boards: options.boards ?? [] }] });
	const lines: string[] = [];
	return {
		lines,
		input: {
			loaded,
			context: { repoRoot: "/tmp/test", org: "acme", dryRun: options.dryRun ?? false },
			loader: loaderFor(loaded, projects),
			io: memoryIo(),
			prompt: promptOf(),
			print: (line: string) => lines.push(stripVTControlCharacters(line)),
			logger: fakeLogger(),
		},
	};
}
