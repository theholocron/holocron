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
	environments?: { name: string; variables: { name: string; value: unknown; secret?: boolean }[] }[];
	items: { name: string }[];
};

describe("convertCollection", () => {
	it("writes a Bruno JSON file with the scripts translated and no pm left", async () => {
		const { json, issues } = await convertCollection(collection, [environment]);
		const doc = JSON.parse(json) as Doc;
		expect(issues).toEqual([]);
		expect(doc.name).toBe("Demo");
		expect(doc.items.map((item) => item.name)).toEqual(["ping"]);
		expect(json).not.toMatch(/\bpm\./);
		expect(json).toContain('req.setHeader(\\"X-A\\", \\"1\\");');
		expect(json).toContain("res.getStatus()");
	});

	it("carries the environment inside the file, under its own name, a secret marked", async () => {
		const { json } = await convertCollection(collection, [environment]);
		const [env] = (JSON.parse(json) as Doc).environments!;
		expect(env!.name).toBe("Demo (development)");
		expect(env!.variables.map(({ name, value, secret }) => ({ name, value, secret }))).toEqual([
			{ name: "baseUrl", value: "http://127.0.0.1:3000", secret: false },
			{ name: "secret", value: "", secret: true },
		]);
	});

	it("writes an empty environments list when there are none", async () => {
		const { json } = await convertCollection(collection, []);
		expect((JSON.parse(json) as Doc).environments).toEqual([]);
	});

	it("rejects a file that is not a collection", async () => {
		await expect(convertCollection({ nope: true }, [])).rejects.toThrow();
	});
});
