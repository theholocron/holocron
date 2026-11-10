import { homedir, userInfo } from "node:os";

import { describe, expect, it } from "vitest";

import { describeSystem, readSystem } from "./read-system.js";

describe("describeSystem", () => {
	it("takes the home and the account's shell, then SHELL", () => {
		const os = { homedir: () => "/Users/me", userInfo: () => ({ shell: "/bin/bash" }) };
		expect(describeSystem(os, "/bin/fish")).toEqual({ home: "/Users/me", shell: "/bin/bash" });
		const none = { homedir: () => "/h", userInfo: () => ({ shell: null }) };
		expect(describeSystem(none, "/bin/fish").shell).toBe("/bin/fish");
		expect(describeSystem(none, undefined).shell).toBe("/bin/zsh");
	});
});

describe("readSystem", () => {
	it("reads this machine: the account's shell when absolute, else SHELL, else zsh", () => {
		const system = readSystem();
		const account = userInfo().shell;
		const env = process.env.SHELL;
		const expected = [account, env].find((shell) => shell?.startsWith("/") === true) ?? "/bin/zsh";
		expect(system).toEqual({ home: homedir(), shell: expected });
	});
});
