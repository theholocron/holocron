import { describe, expect, it } from "vitest";

import { DEFAULT_SHELL, pickShell } from "./pick-shell.js";

describe("pickShell", () => {
	it("prefers the account's shell, then SHELL", () => {
		expect(pickShell("/bin/bash", "/bin/fish")).toBe("/bin/bash");
		expect(pickShell(null, "/bin/fish")).toBe("/bin/fish");
		expect(pickShell(undefined, "/bin/fish")).toBe("/bin/fish");
	});

	it("skips a value that is empty or not an absolute path", () => {
		expect(pickShell("", "/bin/fish")).toBe("/bin/fish");
		expect(pickShell("zsh", "bash")).toBe(DEFAULT_SHELL);
	});

	it("falls back to zsh", () => {
		expect(pickShell(null, undefined)).toBe("/bin/zsh");
	});
});
