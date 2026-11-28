import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigFileError } from "../errors/index.js";
import { loadLayeredFromContent } from "./load-layered-from-content.js";

describe("loadLayeredFromContent", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "datapad-content-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	/** A fetch over a map of file name to content; a name not in it is absent. */
	const files = (map: Record<string, string>) => async (path: string) => map[path];
	const opts = (map: Record<string, string>) => ({
		dir,
		name: "astromech",
		fetch: files(map),
		fallback: { file: "holocron", key: "tasks" },
	});

	it("returns null when neither the dedicated file nor the fallback key is there", async () => {
		expect(
			await loadLayeredFromContent(opts({ "holocron.config.json": JSON.stringify({ name: "x" }) }))
		).toBeNull();
		expect(await loadLayeredFromContent(opts({}))).toBeNull();
	});

	it("reads the dedicated file alone", async () => {
		const result = await loadLayeredFromContent<{ tasks: string[] }>(
			opts({ "astromech.config.json": JSON.stringify({ tasks: ["lint"] }) })
		);
		expect(result).toEqual({
			config: { tasks: ["lint"] },
			filepath: "astromech.config.json",
			sources: ["astromech.config.json"],
		});
	});

	it("reads the fallback key when there is no dedicated file", async () => {
		const result = await loadLayeredFromContent<{ list: string[] }>(
			opts({ "holocron.config.json": JSON.stringify({ tasks: { list: ["test"] } }) })
		);
		expect(result?.config).toEqual({ list: ["test"] });
		expect(result?.filepath).toBe("holocron.config.json");
	});

	it("merges the dedicated file over the fallback key, dedicated first in priority, and lists the sources low to high", async () => {
		const result = await loadLayeredFromContent<{ linters: string[]; coverage: boolean }>(
			opts({
				"holocron.config.json": JSON.stringify({ tasks: { linters: ["eslint"], coverage: true } }),
				"astromech.config.json": JSON.stringify({ linters: ["biome"] }),
			})
		);
		expect(result?.config).toEqual({ linters: ["eslint", "biome"], coverage: true });
		expect(result?.filepath).toBe("astromech.config.json");
		expect(result?.sources).toEqual(["holocron.config.json", "astromech.config.json"]);
	});

	it("probes the extensions in order and executes a module", async () => {
		const result = await loadLayeredFromContent<{ tasks: string[] }>(
			opts({ "astromech.config.mjs": "export default { tasks: ['build'] };" })
		);
		expect(result?.config).toEqual({ tasks: ["build"] });
		expect(result?.filepath).toBe("astromech.config.mjs");
	});

	it("uses a preloaded fallback as is, without fetching it, and reports its path", async () => {
		const requested: string[] = [];
		const result = await loadLayeredFromContent<{ list: string[] }>({
			dir,
			name: "astromech",
			fetch: async (path) => {
				requested.push(path);
				return undefined;
			},
			fallback: {
				key: "tasks",
				preloaded: { config: { tasks: { list: ["from-parent"] } }, filepath: "holocron.config.ts" },
			},
		});
		expect(result?.config).toEqual({ list: ["from-parent"] });
		expect(result?.sources).toEqual(["holocron.config.ts"]);
		expect(requested.every((path) => path.startsWith("astromech."))).toBe(true);
	});

	it("treats a preloaded null as the fallback being absent", async () => {
		const result = await loadLayeredFromContent<{ tasks: string[] }>({
			dir,
			name: "astromech",
			fetch: files({ "astromech.config.json": JSON.stringify({ tasks: ["lint"] }) }),
			fallback: { key: "tasks", preloaded: null },
		});
		expect(result?.sources).toEqual(["astromech.config.json"]);
	});

	it("works with no fallback configured", async () => {
		const result = await loadLayeredFromContent<{ tasks: string[] }>({
			dir,
			name: "astromech",
			fetch: files({ "astromech.config.json": JSON.stringify({ tasks: ["build"] }) }),
		});
		expect(result?.config).toEqual({ tasks: ["build"] });
	});

	it("applies coerce to each layer before merging, so a bare array stands for { tasks }", async () => {
		const coerce = (raw: unknown) =>
			Array.isArray(raw) ? { tasks: raw as string[] } : (raw as { tasks: string[] });
		const result = await loadLayeredFromContent<{ tasks: string[] }>({
			...opts({
				"holocron.config.json": JSON.stringify({ tasks: ["typecheck"] }),
				"astromech.config.json": JSON.stringify(["lint"]),
			}),
			coerce,
		});
		expect(result?.config).toEqual({ tasks: ["typecheck", "lint"] });
	});

	it("treats a layer coerce turns into undefined as absent", async () => {
		const result = await loadLayeredFromContent<{ tasks: string[] }>({
			...opts({ "holocron.config.json": JSON.stringify({ tasks: null }) }),
			coerce: (raw) => (raw == null ? undefined : (raw as { tasks: string[] })),
		});
		expect(result).toBeNull();
	});

	it("treats a dedicated file coerce turns into undefined as absent, leaving the fallback alone", async () => {
		const result = await loadLayeredFromContent<{ tasks: string[] }>({
			...opts({
				"holocron.config.json": JSON.stringify({ tasks: { tasks: ["lint"] } }),
				"astromech.config.json": JSON.stringify(null),
			}),
			coerce: (raw) => (raw == null ? undefined : (raw as { tasks: string[] })),
		});
		expect(result?.sources).toEqual(["holocron.config.json"]);
		expect(result?.filepath).toBe("holocron.config.json");
	});

	it("takes a fallback with neither a file nor a preloaded config as absent", async () => {
		const result = await loadLayeredFromContent<{ tasks: string[] }>({
			dir,
			name: "astromech",
			fetch: files({ "astromech.config.json": JSON.stringify({ tasks: ["lint"] }) }),
			fallback: { key: "tasks" },
		});
		expect(result?.sources).toEqual(["astromech.config.json"]);
	});

	it("names the dedicated file when it cannot be executed", async () => {
		const err = await loadLayeredFromContent(opts({ "astromech.config.json": "{ not json" })).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).filepath).toBe("astromech.config.json");
	});

	it("names the fallback file when it cannot be executed", async () => {
		const err = await loadLayeredFromContent(opts({ "holocron.config.json": "{ not json" })).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).filepath).toBe("holocron.config.json");
	});

	it("lets what fetch throws propagate as it is", async () => {
		const boom = new Error("403 from the API");
		const err = await loadLayeredFromContent({
			dir,
			name: "astromech",
			fetch: async () => {
				throw boom;
			},
		}).catch((e: unknown) => e);
		expect(err).toBe(boom);
	});
});
