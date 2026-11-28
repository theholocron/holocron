import { describe, expect, it, vi } from "vitest";
import type { Argv } from "yargs";

import { redeliverCommand } from "./redeliver.command.js";

describe("redeliver", () => {
	it("is the redeliver verb, with webhooks and the menu fallback under it", () => {
		const command = vi.fn();
		const y = { command } as unknown as Argv;
		command.mockReturnValue(y);

		(redeliverCommand.builder as (y: Argv) => unknown)(y);

		expect(redeliverCommand.command).toBe("redeliver");
		expect(command.mock.calls.map(([module]) => (module as { command: string }).command)).toEqual([
			"webhooks",
			expect.stringContaining("$0"),
		]);
	});

	it("does nothing itself: a bare call opens the menu through its $0 child", () => {
		expect((redeliverCommand.handler as () => unknown)()).toBeUndefined();
	});
});
