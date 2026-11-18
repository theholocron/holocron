import { ConfigError } from "@theholocron/kyber/config";
import { describe, expect, it } from "vitest";

import { parseDnsRecords } from "./parse-dns-records.js";

const F = "dns-records.json";
const ok = { type: "TXT", name: "_v.example.dev", value: "proof" };

describe("parseDnsRecords", () => {
	it("reads entries, keeping note and proxied only when present", () => {
		expect(parseDnsRecords(JSON.stringify([ok, { ...ok, type: "CNAME", note: "n", proxied: true }]), F)).toEqual([
			ok,
			{ ...ok, type: "CNAME", note: "n", proxied: true },
		]);
	});

	it("reads an empty file as an empty list", () => {
		expect(parseDnsRecords("  \n", F)).toEqual([]);
	});

	it.each([
		["not JSON", "{", /is not JSON/],
		["not an array", "{}", /array of records/],
		["an entry that is not an object", "[1]", /entry 1 must be an object/],
		["an unknown type", JSON.stringify([{ ...ok, type: "MX" }]), /type must be one of/],
		["a missing name", JSON.stringify([{ type: "TXT", value: "x" }]), /name must be a non-empty string/],
		["an empty value", JSON.stringify([{ ...ok, value: "" }]), /value must be a non-empty string/],
		["a note that is not text", JSON.stringify([{ ...ok, note: 1 }]), /note must be a string/],
		["proxied that is not a boolean", JSON.stringify([{ ...ok, proxied: "no" }]), /proxied must be true or false/],
	])("rejects %s with a ConfigError", (_name, text, message) => {
		const err = (() => {
			try {
				parseDnsRecords(text, F);
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(message);
	});
});
