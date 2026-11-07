import { vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { IssueRecord, Issues, PluginLoader, Projects, RuntimeContext } from "../../plugin/index.js";

type Raw = Parameters<typeof resolveConfig>[0];

/** A config with the given providers, resolved. */
export const loadedWith = (providers: Record<string, unknown> = {}): LoadedConfig => ({
	resolved: resolveConfig({ name: "demo", org: "acme", providers } as Raw),
	filepath: "/tmp/test/holocron.config.json",
});

/** A loader that offers the given capabilities, or fails to load the ones in `failures`. */
export function fakeLoader(caps: Record<string, unknown>, failures: Record<string, string> = {}): PluginLoader {
	return {
		load: async () => {},
		loadedKeys: () => Object.keys(caps),
		loadFailures: () =>
			Object.entries(failures).map(([key, message]) => ({ key, provider: "p", error: new Error(message) })),
		has: (key: string) => key in caps,
		get: (key: string) => caps[key],
	} as unknown as PluginLoader;
}

/** A `makeLoader` that hands each provider its own capabilities, so a test can have a GitHub side and a Linear side. */
export const loaderFor =
	(sides: Record<string, Record<string, unknown>>, failures: Record<string, Record<string, string>> = {}) =>
	(resolved: LoadedConfig["resolved"], _context: RuntimeContext) => {
		const provider =
			Object.values(resolved.providers).map((e) => (e?.cardinality === "single" ? e.tuple.provider : ""))[0] ??
			"";
		return fakeLoader(sides[provider] ?? {}, failures[provider]);
	};

export const record = (key: string, over: Partial<IssueRecord> = {}): IssueRecord => ({
	key,
	url: `https://example.test/${key}`,
	title: `Issue ${key}`,
	statusCategory: "open",
	closed: false,
	labels: [],
	blockedBy: [],
	comments: [],
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-02T00:00:00Z",
	...over,
});

/** An `issues` provider whose export and import are spies. */
export const fakeIssues = (name: string, over: Partial<Issues> = {}): Issues =>
	({
		key: "issues",
		providerName: name,
		export: vi.fn(async () => []),
		import: vi.fn(async () => []),
		...over,
	}) as unknown as Issues;

/** A `projects` provider with the given items. */
export const fakeBoards = (over: Partial<Projects> = {}): Projects =>
	({
		key: "projects",
		providerName: "github",
		list: vi.fn(async () => []),
		find: vi.fn(async () => undefined),
		...over,
	}) as unknown as Projects;
