import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConsoleLogger } from "./console.js";

const spies = {
	debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
	info: vi.spyOn(console, "info").mockImplementation(() => {}),
	warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
	error: vi.spyOn(console, "error").mockImplementation(() => {}),
};

beforeEach(() => {
	for (const s of Object.values(spies)) s.mockClear();
});
afterEach(() => {
	for (const s of Object.values(spies)) s.mockClear();
});

describe("ConsoleLogger", () => {
	it("routes each level to the matching console method", () => {
		const log = new ConsoleLogger({ level: "debug" });
		log.debug("d");
		log.info("i");
		log.warn("w");
		log.error("e");
		expect(spies.debug).toHaveBeenCalledWith("d");
		expect(spies.info).toHaveBeenCalledWith("i");
		expect(spies.warn).toHaveBeenCalledWith("w");
		expect(spies.error).toHaveBeenCalledWith("e");
	});

	it("drops lines below the configured level", () => {
		const log = new ConsoleLogger({ level: "warn" });
		log.info("dropped");
		log.warn("kept");
		expect(spies.info).not.toHaveBeenCalled();
		expect(spies.warn).toHaveBeenCalledWith("kept");
	});

	it("emits a structured call as (message, context)", () => {
		new ConsoleLogger().info({ repo: "theholocron/observability" }, "sync complete");
		expect(spies.info).toHaveBeenCalledWith("sync complete", { repo: "theholocron/observability" });
	});

	it("emits the context object alone when no message is given", () => {
		new ConsoleLogger().error({ code: "EPERM" });
		expect(spies.error).toHaveBeenCalledWith({ code: "EPERM" });
	});

	it("child() merges bindings into every line and keeps the level", () => {
		const log = new ConsoleLogger({ level: "info" }).child({ runId: "r1" }).child({ module: "sync" });
		log.info({ repo: "x" }, "go");
		expect(spies.info).toHaveBeenCalledWith("go", { runId: "r1", module: "sync", repo: "x" });
	});

	it("appends bindings to a bare-string line", () => {
		new ConsoleLogger().child({ runId: "r1" }).info("hello");
		expect(spies.info).toHaveBeenCalledWith("hello", { runId: "r1" });
	});
});
