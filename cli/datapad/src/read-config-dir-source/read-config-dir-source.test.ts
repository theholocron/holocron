import { describe, expect, it, vi } from "vitest";

import { readConfigDirSource } from "./read-config-dir-source.js";

const source = (files: Record<string, string>) => vi.fn((path: string) => Promise.resolve(files[path]));

describe("readConfigDirSource", () => {
	it("returns the first extension (TS-first) found for each area", async () => {
		const fetch = source({
			".holocron/notifications.json": "{}",
			".holocron/notifications.ts": "export default {}",
			".holocron/repo.json": '{"topics":[]}',
		});
		expect(await readConfigDirSource({ dir: ".holocron", areas: ["notifications", "repo"], fetch })).toEqual([
			{
				area: "notifications",
				path: ".holocron/notifications.ts",
				extension: "ts",
				content: "export default {}",
			},
			{ area: "repo", path: ".holocron/repo.json", extension: "json", content: '{"topics":[]}' },
		]);
	});

	it("leaves out an area with no file, and returns [] for a missing directory", async () => {
		const fetch = source({});
		expect(await readConfigDirSource({ dir: ".holocron", areas: ["notifications", "repo"], fetch })).toEqual([]);
		// Every extension is probed for every area, and nothing else is asked for.
		expect(fetch).toHaveBeenCalledTimes(10);
	});

	it("honours a custom extension order and a custom directory", async () => {
		const fetch = source({ "cfg/a.json": "{}", "cfg/a.ts": "export default {}" });
		const found = await readConfigDirSource({ dir: "cfg", areas: ["a"], fetch, extensions: ["json", "ts"] });
		expect(found.map((s) => s.path)).toEqual(["cfg/a.json"]);
	});

	it("propagates a fetch failure rather than reading it as absent", async () => {
		const fetch = vi.fn(() => Promise.reject(new Error("network down")));
		await expect(readConfigDirSource({ dir: ".holocron", areas: ["repo"], fetch })).rejects.toThrow("network down");
	});
});
