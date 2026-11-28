import { describe, expect, it } from "vitest";

import { isPosixShell, shellName } from "./posix-shell.js";

describe("shellName", () => {
	it("takes the last path component", () => {
		expect(shellName("/usr/local/bin/fish")).toBe("fish");
		expect(shellName("zsh")).toBe("zsh");
	});
});

describe("isPosixShell", () => {
	it.each(["sh", "bash", "zsh", "dash", "ksh"])("accepts %s", (name) => {
		expect(isPosixShell(`/bin/${name}`)).toBe(true);
	});

	it("accepts a path with more components", () => {
		expect(isPosixShell("/opt/homebrew/bin/bash")).toBe(true);
	});

	it("rejects fish, nushell and unknown names", () => {
		expect(isPosixShell("/opt/homebrew/bin/fish")).toBe(false);
		expect(isPosixShell("/usr/local/bin/nu")).toBe(false);
		expect(isPosixShell("/bin/mystery")).toBe(false);
		expect(isPosixShell("/bin/bash/")).toBe(false);
	});
});
