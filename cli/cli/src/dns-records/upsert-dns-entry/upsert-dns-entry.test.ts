import { describe, expect, it } from "vitest";

import type { DnsListEntry } from "../dns-records.type.js";
import { upsertDnsEntry } from "./upsert-dns-entry.js";

const a: DnsListEntry = { type: "CNAME", name: "status.example.dev", value: "one" };
const b: DnsListEntry = { type: "TXT", name: "_v.example.dev", value: "two" };

describe("upsertDnsEntry", () => {
	it("puts a new entry last and leaves the list given alone", () => {
		const list = [a];
		expect(upsertDnsEntry(list, b)).toEqual({ list: [a, b], replaced: undefined });
		expect(list).toEqual([a]);
	});

	it("replaces the entry with the same type and name, in place, ignoring case and a final dot", () => {
		const next = { ...a, name: "Status.example.dev.", value: "three" };
		expect(upsertDnsEntry([a, b], next)).toEqual({ list: [next, b], replaced: a });
	});

	it("keeps a record of another type at the same name", () => {
		const txt: DnsListEntry = { ...a, type: "TXT" };
		expect(upsertDnsEntry([a], txt).list).toEqual([a, txt]);
	});
});
