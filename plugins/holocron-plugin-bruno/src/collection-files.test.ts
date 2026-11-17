import { describe, expect, it } from "vitest";

import { collectionFiles, safeName } from "./collection-files.js";

const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
const request = (name: string) => ({ name, request: { method: "GET", url: `{{baseUrl}}/${name}` } });
const collection = {
	info: { name: "Demo", schema: SCHEMA },
	item: [{ name: "Rejected: no signature", item: [request("a")] }, request("ping"), request("a/b"), request("a-b")],
};
const environment = {
	name: "Demo (dev)",
	values: [
		{ key: "baseUrl", value: "https://dev.example.com", type: "default", enabled: true },
		{ key: "webhookSecret", value: "do-not-write", type: "secret", enabled: true },
	],
};

describe("safeName", () => {
	it.each([
		["Signed, no effect", "Signed, no effect"],
		["a/b: c?", "a-b- c-"],
		["  ends with dots...  ", "ends with dots"],
		["", "untitled"],
		["???", "---"],
	])("turns %j into %j", (name, expected) => {
		expect(safeName(name)).toBe(expected);
	});
});

describe("collectionFiles", () => {
	it("lays the collection out the way Bruno writes it", async () => {
		const { name, files } = await collectionFiles(collection, [environment]);
		expect(name).toBe("Demo");
		expect([...files.keys()].sort()).toEqual([
			"Rejected- no signature/a.yml",
			"Rejected- no signature/folder.yml",
			"a-b (2).yml",
			"a-b.yml",
			"environments/Demo (dev).yml",
			"opencollection.yml",
			"ping.yml",
		]);
		expect(files.get("opencollection.yml")).toMatch(/^opencollection: 1\.0\.0\n\ninfo:\n {2}name: Demo\n/);
		expect(files.get("Rejected- no signature/folder.yml")).toContain('name: "Rejected: no signature"');
		expect(files.get("ping.yml")).toContain('url: "{{baseUrl}}/ping"');
	});

	it("keeps the value of a secret variable out of the environment file", async () => {
		const { files } = await collectionFiles(collection, [environment]);
		const text = files.get("environments/Demo (dev).yml") as string;
		expect(text).toContain("https://dev.example.com");
		expect(text).toMatch(/- secret: true\n\s+name: webhookSecret/);
		expect(text).not.toContain("do-not-write");
	});

	it("writes the same text every time", async () => {
		const first = await collectionFiles(collection, [environment]);
		const second = await collectionFiles(collection, [environment]);
		expect([...second.files]).toEqual([...first.files]);
	});

	it("falls back to a name when the collection has none and reports what the converter could not carry", async () => {
		const { name, files, issues } = await collectionFiles({ info: { schema: SCHEMA }, item: [] }, []);
		expect(name).toBe("Untitled Collection");
		expect([...files.keys()]).toEqual(["opencollection.yml"]);
		expect(issues).toEqual([]);
	});
});
