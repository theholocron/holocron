import { describe, expect, it, vi } from "vitest";
import type { Argv } from "yargs";

import { showCommand } from "./show.command.js";

describe("show", () => {
	it("is the show verb, with config and the menu fallback under it", () => {
		const command = vi.fn();
		const y = { command } as unknown as Argv;
		command.mockReturnValue(y);

		(showCommand.builder as (y: Argv) => unknown)(y);

		expect(showCommand.command).toBe("show");
		expect(command.mock.calls.map(([module]) => (module as { command: string }).command)).toEqual([
			"config",
			expect.stringContaining("$0"),
		]);
	});

	it("does nothing itself: a bare call opens the menu through its $0 child", () => {
		expect((showCommand.handler as () => unknown)()).toBeUndefined();
	});
});
