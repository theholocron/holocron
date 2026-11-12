import { describe, expect, it, vi } from "vitest";
import type { Argv } from "yargs";

import { reconcileCommand } from "./reconcile.command.js";

describe("reconcile", () => {
	it("is the reconcile verb, with project and the menu fallback under it", () => {
		const command = vi.fn();
		const y = { command } as unknown as Argv;
		command.mockReturnValue(y);

		(reconcileCommand.builder as (y: Argv) => unknown)(y);

		expect(reconcileCommand.command).toBe("reconcile");
		expect(command.mock.calls.map(([module]) => (module as { command: string }).command)).toEqual([
			"project [board]",
			expect.stringContaining("$0"),
		]);
	});

	it("does nothing itself: a bare call opens the menu through its $0 child", () => {
		expect((reconcileCommand.handler as () => unknown)()).toBeUndefined();
	});
});
