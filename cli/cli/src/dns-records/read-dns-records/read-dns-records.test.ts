import { describe, expect, it } from "vitest";

import { readDnsRecords } from "./read-dns-records.js";

describe("readDnsRecords", () => {
	it("is empty when the file is absent", async () => {
		expect(await readDnsRecords("/r", { read: async () => null, write: async () => undefined })).toEqual([]);
	});

	it("reads the file under the repository root", async () => {
		const paths: string[] = [];
		const list = await readDnsRecords("/r", {
			read: async (p) => (paths.push(p), '[{"type":"A","name":"a.example.dev","value":"1.2.3.4"}]'),
			write: async () => undefined,
		});
		expect(paths).toEqual(["/r/.holocron/dns-records.json"]);
		expect(list).toEqual([{ type: "A", name: "a.example.dev", value: "1.2.3.4" }]);
	});
});
