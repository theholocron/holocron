import { describe, expect, it } from "vitest";

import { withDcgHook } from "./with-dcg-hook.js";

const HOOK = { matcher: "Bash", hooks: [{ type: "command", command: "dcg" }] };

describe("withDcgHook", () => {
	it("makes the hooks of an empty file", () => {
		expect(withDcgHook({})).toEqual({ hooks: { PreToolUse: [HOOK] } });
	});

	it("keeps permissions, other hook events and other matchers, and adds the entry last", () => {
		const other = { matcher: "Edit", hooks: [{ type: "command", command: "fmt" }] };
		const settings = {
			permissions: { allow: ["Bash(pnpm test:*)"] },
			hooks: { PreToolUse: [other], PostToolUse: [{ matcher: "Edit", hooks: [] }] },
		};
		expect(withDcgHook(settings)).toEqual({
			permissions: settings.permissions,
			hooks: { PreToolUse: [other, HOOK], PostToolUse: settings.hooks.PostToolUse },
		});
	});

	it("changes nothing when dcg is already wired, whatever else sits in the entry or how it is called", () => {
		for (const command of ["dcg", "dcg --strict", "/Users/me/.local/bin/dcg"]) {
			const wired = {
				hooks: {
					PreToolUse: [
						{
							matcher: "Bash",
							hooks: [
								{ type: "command", command: "other" },
								{ type: "command", command },
							],
						},
					],
				},
			};
			expect(withDcgHook(wired)).toBe(wired);
		}
	});

	it("does not count another program, another matcher or a hook with no command as wired", () => {
		const settings = {
			hooks: {
				PreToolUse: [
					{ matcher: "Bash", hooks: [{ type: "command", command: "dcg-wrapper" }, { type: "prompt" }, "x"] },
					{ matcher: "Edit", hooks: [{ type: "command", command: "dcg" }] },
					{ matcher: "Bash" },
					"not an entry",
				],
			},
		};
		const result = withDcgHook(settings) as { hooks: { PreToolUse: unknown[] } };
		expect(result.hooks.PreToolUse).toHaveLength(5);
		expect(result.hooks.PreToolUse.at(-1)).toEqual(HOOK);
	});

	it("refuses a file it cannot add to, naming what is wrong, rather than replacing it", () => {
		expect(() => withDcgHook([])).toThrow("not a JSON object");
		expect(() => withDcgHook(null)).toThrow("not a JSON object");
		expect(() => withDcgHook({ hooks: [] })).toThrow("`hooks` in the settings file is not an object");
		expect(() => withDcgHook({ hooks: { PreToolUse: {} } })).toThrow(
			"`hooks.PreToolUse` in the settings file is not a list"
		);
	});
});
