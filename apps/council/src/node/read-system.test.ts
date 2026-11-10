import { homedir } from "node:os";

import { describe, expect, it } from "vitest";

import { describeSystem, readSystem } from "./read-system.js";

describe("describeSystem", () => {
	it("takes the home and the account's shell, then SHELL", () => {
		const os = { homedir: () => "/Users/me", userInfo: () => ({ shell: "/bin/bash" }) };
		expect(describeSystem(os, { SHELL: "/bin/fish" })).toEqual({ home: "/Users/me", shell: "/bin/bash" });
		const none = { homedir: () => "/h", userInfo: () => ({ shell: null }) };
		expect(describeSystem(none, { SHELL: "/bin/fish" }).shell).toBe("/bin/fish");
		expect(describeSystem(none, {}).shell).toBe("/bin/zsh");
	});
});

describe("readSystem", () => {
	it("reads this machine", () => {
		const system = readSystem();
		expect(system.home).toBe(homedir());
		expect(system.shell.startsWith("/")).toBe(true);
	});
});
