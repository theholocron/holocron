import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadTasksConfig } from "@theholocron/astromech/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "./index.js";

vi.mock("@theholocron/astromech/config", () => ({ loadTasksConfig: vi.fn().mockResolvedValue({}) }));

describe("loadConfig → loadTasksConfig", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "holocron-cfg-pre-"));
	});
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("hands the holocron.config it already loaded to loadTasksConfig, so it isn't loaded twice", async () => {
		const filepath = join(cwd, "holocron.config.json");
		await writeFile(filepath, JSON.stringify({ name: "demo", providers: {}, tasks: ["lint"] }));

		await loadConfig(cwd);

		expect(loadTasksConfig).toHaveBeenCalledTimes(1);
		expect(loadTasksConfig).toHaveBeenCalledWith(cwd, {
			holocron: expect.objectContaining({ filepath, config: expect.objectContaining({ tasks: ["lint"] }) }),
		});
	});
});
