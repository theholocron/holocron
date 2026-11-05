import { describe, expect, it, vi } from "vitest";
import type { CommandModule } from "yargs";

import { runCommand } from "./run-command.js";

const handler = vi.fn();
const greet: CommandModule = {
	command: "greet <name>",
	describe: "say hello",
	builder: (y) => y.positional("name", { type: "string" }).option("loud", { type: "boolean", default: false }),
	handler: (argv) => handler(argv),
};

describe("runCommand", () => {
	it("parses the arguments through the module's builder and returns what the parse produced", async () => {
		handler.mockClear();
		const argv = await runCommand(greet, ["greet", "Leia", "--loud"]);
		expect(argv).toMatchObject({ name: "Leia", loud: true });
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("declares the root options configure gives it before the command", async () => {
		const argv = await runCommand(greet, ["greet", "Leia"], (parser) =>
			parser.option("cwd", { type: "string", default: "/repo" })
		);
		expect(argv["cwd"]).toBe("/repo");
	});

	it("keeps what follows -- under the `--` key", async () => {
		const argv = await runCommand(greet, ["greet", "Leia", "--", "extra", "words"]);
		expect(argv["--"]).toEqual(["extra", "words"]);
	});

	it("hands a handler's error to the test as a rejection", async () => {
		const failing: CommandModule = {
			command: "fail",
			handler: () => {
				throw new Error("handler failed");
			},
		};
		await expect(runCommand(failing, ["fail"])).rejects.toThrow("handler failed");
	});

	it("rejects with yargs' own message for a usage error", async () => {
		await expect(runCommand(greet, ["greet"])).rejects.toThrow(/Not enough non-option arguments/);
	});
});
