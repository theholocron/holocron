import { describe, expect, it, vi } from "vitest";
import type { Argv } from "yargs";

import { projectCommand } from "./project.command.js";

describe("project", () => {
	it("is the project group, with status and the menu fallback under it", () => {
		const command = vi.fn();
		const y = { command } as unknown as Argv;
		command.mockReturnValue(y);

		(projectCommand.builder as (y: Argv) => unknown)(y);

		expect(projectCommand.command).toBe("project");
		expect(command.mock.calls.map(([module]) => (module as { command: string }).command)).toEqual([
			"status <issue> <status>",
			expect.stringContaining("$0"),
		]);
	});

	it("does nothing itself: a bare call opens the menu through its $0 child", () => {
		expect((projectCommand.handler as () => unknown)()).toBeUndefined();
	});
});
