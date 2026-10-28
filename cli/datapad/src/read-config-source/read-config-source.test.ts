import { describe, expect, it, vi } from "vitest";

import { readConfigSource } from "./read-config-source.js";

const source = (files: Record<string, string>) => vi.fn((path: string) => Promise.resolve(files[path]));

describe("readConfigSource", () => {
	it("returns the first extension (TS-first) whose file exists, with its path and extension", async () => {
		const fetch = source({ "app.config.json": "{}", "app.config.js": "export default {}" });
		expect(await readConfigSource({ name: "app", fetch })).toEqual({
			path: "app.config.js",
			extension: "js",
			content: "export default {}",
		});
		// ts was asked for first, json (lower priority) never reached.
		expect(fetch.mock.calls.map(([p]) => p)).toEqual(["app.config.ts", "app.config.js"]);
	});

	it("honours a custom extension order", async () => {
		const fetch = source({ "app.config.json": "{}", "app.config.ts": "export default {}" });
		const found = await readConfigSource({ name: "app", fetch, extensions: ["json", "ts"] });
		expect(found?.extension).toBe("json");
	});

	it("returns undefined when no extension has a file", async () => {
		expect(await readConfigSource({ name: "app", fetch: source({}) })).toBeUndefined();
	});

	it("treats an empty file as present, not absent", async () => {
		expect((await readConfigSource({ name: "app", fetch: source({ "app.config.ts": "" }) }))?.content).toBe("");
	});

	it("lets a fetch failure propagate instead of reading it as absent", async () => {
		const fetch = vi.fn(() => Promise.reject(new Error("network down")));
		await expect(readConfigSource({ name: "app", fetch })).rejects.toThrow("network down");
	});
});
