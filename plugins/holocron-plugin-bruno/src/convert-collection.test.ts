import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

import { convertCollection } from "./convert-collection.js";

const collection = {
	info: {
		name: "Demo",
		schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
	},
	item: [
		{
			name: "ping",
			event: [
				{
					listen: "prerequest",
					script: { type: "text/javascript", exec: ['pm.request.headers.add({ key: "X-A", value: "1" });'] },
				},
				{
					listen: "test",
					script: {
						type: "text/javascript",
						exec: ['pm.test("ok", () => pm.response.to.have.status(200));'],
					},
				},
			],
			request: { method: "GET", url: { raw: "{{baseUrl}}/ping", host: ["{{baseUrl}}"], path: ["ping"] } },
		},
	],
};

const environment = {
	name: "Demo (development)",
	values: [
		{ key: "baseUrl", value: "http://127.0.0.1:3000", type: "default", enabled: true },
		{ key: "secret", value: "", type: "secret", enabled: true },
	],
};

type Doc = {
	name: string;
	environments?: { name: string; variables: { name: string; value: unknown; transient?: boolean }[] }[];
	items: { name: string; scripts?: Record<string, string> }[];
};

describe("convertCollection", () => {
	it("writes an OpenCollection document with the scripts translated and no pm left", async () => {
		const { text, issues } = await convertCollection(collection, [environment]);
		const doc = load(text) as Doc;
		expect(issues).toEqual([]);
		expect(doc.name).toBe("Demo");
		expect(doc.items.map((item) => item.name)).toEqual(["ping"]);
		expect(text).not.toMatch(/\bpm\./);
		expect(text).toContain('req.setHeader("X-A", "1");');
		expect(text).toContain("res.getStatus()");
	});

	it("carries the environment inside the document, under its own name, a secret as transient", async () => {
		const { text } = await convertCollection(collection, [environment]);
		const [env] = (load(text) as Doc).environments!;
		expect(env!.name).toBe("Demo (development)");
		expect(env!.variables).toEqual([
			{ name: "baseUrl", value: "http://127.0.0.1:3000" },
			{ name: "secret", value: "", transient: true },
		]);
	});

	it("writes no environments when there are none", async () => {
		const { text } = await convertCollection(collection, []);
		expect(load(text)).not.toHaveProperty("environments");
	});

	it("rejects a file that is not a collection", async () => {
		await expect(convertCollection({ nope: true }, [])).rejects.toThrow();
	});
});
