import { describe, expect, it } from "vitest";

import { writeDnsRecords } from "./write-dns-records.js";

describe("writeDnsRecords", () => {
	it("writes the list as JSON under the repository root, ending in a newline", async () => {
		const written: Array<[string, string]> = [];
		await writeDnsRecords("/r", [{ type: "TXT", name: "_v.example.dev", value: "proof", note: "Checkly" }], {
			read: async () => null,
			write: async (p, t) => void written.push([p, t]),
		});
		expect(written).toHaveLength(1);
		expect(written[0]?.[0]).toBe("/r/.holocron/dns-records.json");
		expect(JSON.parse(written[0]![1])).toEqual([
			{ type: "TXT", name: "_v.example.dev", value: "proof", note: "Checkly" },
		]);
		expect(written[0]![1].endsWith("\n")).toBe(true);
	});
});
