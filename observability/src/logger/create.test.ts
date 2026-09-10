import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLogger } from "./create.js";

const ENV_KEYS = [
	"CI",
	"HOLOCRON_LOG_LEVEL",
	"HOLOCRON_TELEMETRY",
	"HOLOCRON_AXIOM_TOKEN",
	"HOLOCRON_AXIOM_DATASET",
	"AXIOM_TOKEN",
	"AXIOM_DATASET",
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
	// Keep every logger built here on the plain-stdout path — no worker-thread
	// transports (pino-pretty / Axiom) spun up during the unit suite.
	process.env.CI = "true";
	process.env.HOLOCRON_TELEMETRY = "false";
	delete process.env.HOLOCRON_LOG_LEVEL;
	delete process.env.HOLOCRON_AXIOM_TOKEN;
	delete process.env.HOLOCRON_AXIOM_DATASET;
	delete process.env.AXIOM_TOKEN;
	delete process.env.AXIOM_DATASET;
});

afterEach(() => {
	for (const key of ENV_KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});

describe("createLogger", () => {
	it("returns a logger and a fresh runId", () => {
		const a = createLogger();
		const b = createLogger();
		expect(a.runId).toMatch(/^[0-9a-f-]{36}$/);
		expect(a.runId).not.toBe(b.runId);
		expect(typeof a.logger.info).toBe("function");
		expect(typeof a.logger.child).toBe("function");
	});

	it("does not throw for any documented config shape", () => {
		expect(() => createLogger({ level: "debug" })).not.toThrow();
		expect(() => createLogger({ level: "warn", axiom: { dataset: "holocron-ci", token: "xaat-x" } })).not.toThrow();
	});

	it("produces a working child logger chain", () => {
		const { logger } = createLogger({ level: "error" });
		const log = logger.child({ command: "setup" }).child({ module: "workflows" });
		expect(() => log.error({ step: "lint" }, "failed")).not.toThrow();
	});

	it("reads HOLOCRON_LOG_LEVEL when no explicit level is given", () => {
		process.env.HOLOCRON_LOG_LEVEL = "debug";
		expect(() => createLogger()).not.toThrow();
	});
});
