import { describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() =>
	vi.fn(async () => ({ resolved: { name: "demo" }, filepath: "/x/holocron.config.json" }))
);
const viewJson = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("../../ui/index.js", () => ({ viewJson }));

import yargs from "yargs";

import { configShowCommand } from "./config-show.command.js";

describe("config show", () => {
	it("is the `config show` command, described as printing the resolved config", () => {
		expect(configShowCommand.command).toBe("config show");
		expect(configShowCommand.describe).toBe("Print the resolved holocron config");
	});

	it("loads the config from --cwd and shows it, with --depth and --interactive", async () => {
		await yargs(["config", "show", "--depth", "2", "--no-interactive", "--cwd", "/repo"])
			.option("cwd", { type: "string" })
			.command(configShowCommand as never)
			.parseAsync();
		expect(loadConfig).toHaveBeenCalledWith("/repo");
		expect(viewJson).toHaveBeenCalledWith({ name: "demo" }, { depth: 2, interactive: false });
	});
});
