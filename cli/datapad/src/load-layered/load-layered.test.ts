import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigFileError } from "../errors/index.js";
import type { Loaded } from "../load-config-file/index.js";
import { loadLayered } from "./load-layered.js";

describe("loadLayered", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "datapad-"));
	});
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	const opts = () => ({ cwd, name: "astromech", fallback: { file: "holocron", key: "tasks" } as const });

	it("returns null when neither the dedicated file nor the fallback key resolves", async () => {
		await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ name: "x" }));
		expect(await loadLayered(opts())).toBeNull();
	});

	it("reads the dedicated file when present", async () => {
		await writeFile(join(cwd, "astromech.config.json"), JSON.stringify({ tasks: ["lint"] }));
		const result = await loadLayered<{ tasks: string[] }>(opts());
		expect(result?.config).toEqual({ tasks: ["lint"] });
		expect(result?.filepath).toBe(join(cwd, "astromech.config.json"));
		expect(result?.sources).toEqual([join(cwd, "astromech.config.json")]);
	});

	it("reads the fallback key when there is no dedicated file", async () => {
		await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ name: "x", tasks: { list: ["test"] } }));
		const result = await loadLayered<{ list: string[] }>(opts());
		expect(result?.config).toEqual({ list: ["test"] });
		expect(result?.filepath).toBe(join(cwd, "holocron.config.json"));
	});

	it("merges the dedicated file over the fallback key, dedicated winning", async () => {
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ tasks: { linters: ["eslint"], coverage: true } })
		);
		await writeFile(join(cwd, "astromech.config.json"), JSON.stringify({ linters: ["biome"] }));
		const result = await loadLayered<{ linters: string[]; coverage: boolean }>(opts());
		expect(result?.config).toEqual({ linters: ["eslint", "biome"], coverage: true });
		expect(result?.sources).toEqual([join(cwd, "holocron.config.json"), join(cwd, "astromech.config.json")]);
	});

	it("works with no fallback configured", async () => {
		await writeFile(join(cwd, "astromech.config.json"), JSON.stringify({ tasks: ["build"] }));
		const result = await loadLayered<{ tasks: string[] }>({ cwd, name: "astromech" });
		expect(result?.config).toEqual({ tasks: ["build"] });
	});

	it("passes walkUp through to the fallback lookup", async () => {
		await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ tasks: { list: ["test"] } }));
		const nested = join(cwd, "nested");
		await mkdir(nested, { recursive: true });
		const result = await loadLayered<{ list: string[] }>({
			cwd: nested,
			name: "astromech",
			fallback: { file: "holocron", key: "tasks" },
			walkUp: true,
		});
		expect(result?.config).toEqual({ list: ["test"] });
		expect(result?.filepath).toBe(join(cwd, "holocron.config.json"));
	});

	describe("coerce", () => {
		// A bare array stands for `{ tasks: [...] }`.
		const asTasks = (raw: unknown) =>
			Array.isArray(raw) ? { tasks: raw as string[] } : (raw as { tasks: string[] });

		it("normalizes both layers before merging them", async () => {
			await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ tasks: ["a"] }));
			await writeFile(join(cwd, "astromech.config.json"), JSON.stringify(["b"]));
			const result = await loadLayered<{ tasks: string[] }>({ ...opts(), coerce: asTasks });
			expect(result?.config).toEqual({ tasks: ["a", "b"] });
		});

		it("treats a layer it returns undefined for as absent", async () => {
			await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ tasks: ["a"] }));
			await writeFile(join(cwd, "astromech.config.json"), JSON.stringify({ ignore: true }));
			const dropIgnored = (raw: unknown) => ((raw as { ignore?: boolean }).ignore ? undefined : asTasks(raw));
			const result = await loadLayered<{ tasks: string[] }>({ ...opts(), coerce: dropIgnored });
			expect(result?.config).toEqual({ tasks: ["a"] });
			expect(result?.sources).toEqual([join(cwd, "holocron.config.json")]);
			expect(result?.filepath).toBe(join(cwd, "holocron.config.json"));
		});

		it("treats a fallback value it returns undefined for as absent", async () => {
			await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ tasks: { ignore: true } }));
			await writeFile(join(cwd, "astromech.config.json"), JSON.stringify(["b"]));
			const dropIgnored = (raw: unknown) => ((raw as { ignore?: boolean }).ignore ? undefined : asTasks(raw));
			const result = await loadLayered<{ tasks: string[] }>({ ...opts(), coerce: dropIgnored });
			expect(result?.config).toEqual({ tasks: ["b"] });
			expect(result?.sources).toEqual([join(cwd, "astromech.config.json")]);
		});

		it("returns null when it discards every layer", async () => {
			await writeFile(join(cwd, "astromech.config.json"), JSON.stringify(["b"]));
			expect(await loadLayered({ ...opts(), coerce: () => undefined })).toBeNull();
		});
	});

	describe("fallback.preloaded", () => {
		const fallback = (preloaded: Loaded<object> | null | undefined) => ({
			cwd,
			name: "astromech",
			fallback: { file: "holocron", key: "tasks", preloaded },
		});
		// Malformed on purpose: reading it at all throws a ConfigFileError, so a loadLayered
		// that loads the fallback despite `preloaded` being set fails these tests.
		const unreadableHolocron = () => writeFile(join(cwd, "holocron.config.json"), "{ not json");

		it("uses a parent the caller already loaded, without reading holocron.config again", async () => {
			await unreadableHolocron();
			// An interface-typed config (no index signature) is accepted without a cast.
			interface Parent {
				tasks: { list: string[] };
			}
			const preloaded: Loaded<Parent> = {
				config: { tasks: { list: ["preloaded"] } },
				filepath: "/elsewhere/holocron.config.ts",
			};
			const result = await loadLayered<{ list: string[] }>(fallback(preloaded));
			expect(result?.config).toEqual({ list: ["preloaded"] });
			expect(result?.filepath).toBe("/elsewhere/holocron.config.ts");
		});

		it("null means the parent was looked for and is absent — it isn't read", async () => {
			await unreadableHolocron();
			expect(await loadLayered(fallback(null))).toBeNull();
		});

		it("undefined falls back to finding the parent itself", async () => {
			await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ tasks: { list: ["from-disk"] } }));
			const result = await loadLayered<{ list: string[] }>(fallback(undefined));
			expect(result?.config).toEqual({ list: ["from-disk"] });
		});

		it("undefined with an unreadable parent surfaces the load error (the control for the tests above)", async () => {
			await unreadableHolocron();
			await expect(loadLayered(fallback(undefined))).rejects.toBeInstanceOf(ConfigFileError);
		});
	});
});
