import { describe, expect, it } from "vitest";

import { isPrivateHost } from "./private-host.js";

describe("isPrivateHost", () => {
	it.each([
		"localhost",
		"LOCALHOST",
		"app.localhost",
		"printer.local",
		"db.internal",
		"127.0.0.1",
		"127.8.9.10",
		"0.0.0.0",
		"10.1.2.3",
		"100.64.0.1",
		"100.127.255.254",
		"169.254.169.254",
		"172.16.0.1",
		"172.31.255.255",
		"192.168.1.1",
		"[::1]",
		"::",
		"[fe80::1]",
		"[fc00::1]",
		"[fd12:3456::1]",
		"[::ffff:7f00:1]",
		"[::ffff:a9fe:a9fe]",
	])("refuses %s", (host) => {
		expect(isPrivateHost(host)).toBe(true);
	});

	it.each([
		"cdn.example.com",
		"8.8.8.8",
		"100.63.0.1",
		"100.128.0.1",
		"172.15.0.1",
		"172.32.0.1",
		"169.253.0.1",
		"192.167.1.1",
		"11.0.0.1",
		"2606:4700::1111",
		"[2606:4700::1111]",
		"[::ffff:808:808]",
		"1.2.3",
	])("allows %s", (host) => {
		expect(isPrivateHost(host)).toBe(false);
	});

	it("judges the host the URL parser yields for an obfuscated address", () => {
		expect(isPrivateHost(new URL("https://2130706433/").hostname)).toBe(true);
		expect(isPrivateHost(new URL("https://0x7f.1/").hostname)).toBe(true);
		expect(isPrivateHost(new URL("https://[::ffff:127.0.0.1]/").hostname)).toBe(true);
	});
});
