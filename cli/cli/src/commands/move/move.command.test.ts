import { describe, expect, it, vi } from "vitest";
import type { Argv } from "yargs";

import { moveCommand } from "./move.command.js";

describe("move", () => {
	it("is the move verb, with issues and the menu fallback under it", () => {
		const command = vi.fn();
		const y = { command } as unknown as Argv;
		command.mockReturnValue(y);

		(moveCommand.builder as (y: Argv) => unknown)(y);

		expect(moveCommand.command).toBe("move");
		expect(command.mock.calls.map(([module]) => (module as { command: string }).command)).toEqual([
			"issues <from> <to>",
			expect.stringContaining("$0"),
		]);
	});

	it("does nothing itself: a bare call opens the menu through its $0 child", () => {
		expect((moveCommand.handler as () => unknown)()).toBeUndefined();
	});
});
