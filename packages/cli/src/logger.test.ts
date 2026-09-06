import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCliLogger, getLogger, getRunId, resetCliLogger, resolveLogLevel } from "./logger.js";

const ENV_KEYS = ["HOLOCRON_LOG_LEVEL"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const createLoggerMock = vi.hoisted(() => vi.fn());

vi.mock("@theholocron/logger", async (importActual) => {
	const actual = await importActual<typeof import("@theholocron/logger")>();
	return {
		...actual,
		createLogger: createLoggerMock,
	};
});

let seq = 0;
function fakeResult(level?: string) {
	return { logger: { level, __fake: true }, runId: `run-${++seq}` };
}

beforeEach(() => {
	resetCliLogger();
	seq = 0;
	createLoggerMock.mockReset();
	createLoggerMock.mockImplementation((config?: { level?: string }) => fakeResult(config?.level));
	delete process.env.HOLOCRON_LOG_LEVEL;
});

afterEach(() => {
	for (const key of ENV_KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
	resetCliLogger();
});

describe("resolveLogLevel", () => {
	it("maps --verbose to debug and --quiet to error", () => {
		expect(resolveLogLevel({ verbose: true })).toBe("debug");
		expect(resolveLogLevel({ quiet: true })).toBe("error");
	});

	it("prefers --verbose over --quiet", () => {
		expect(resolveLogLevel({ verbose: true, quiet: true })).toBe("debug");
	});

	it("reads HOLOCRON_LOG_LEVEL when no flag is set", () => {
		process.env.HOLOCRON_LOG_LEVEL = "warn";
		expect(resolveLogLevel({})).toBe("warn");
	});

	it("HOLOCRON_LOG_LEVEL outranks the config level", () => {
		process.env.HOLOCRON_LOG_LEVEL = "warn";
		expect(resolveLogLevel({}, "debug")).toBe("warn");
	});

	it("falls back to the config level, then undefined", () => {
		expect(resolveLogLevel({}, "error")).toBe("error");
		expect(resolveLogLevel({})).toBeUndefined();
	});

	it("ignores an unrecognised HOLOCRON_LOG_LEVEL", () => {
		process.env.HOLOCRON_LOG_LEVEL = "loud";
		expect(resolveLogLevel({}, "info")).toBe("info");
	});
});

describe("buildCliLogger", () => {
	it("builds once and returns the memoized root on repeat calls", () => {
		const a = buildCliLogger({});
		const b = buildCliLogger({});
		expect(a).toBe(b);
		expect(createLoggerMock).toHaveBeenCalledTimes(1);
	});

	it("passes the resolved flag level through to createLogger", () => {
		buildCliLogger({ verbose: true });
		expect(createLoggerMock).toHaveBeenCalledWith({ level: "debug" });
	});

	it("rebuilds once with the config level when the flag/env pass had none", () => {
		buildCliLogger({}); // middleware pass — no level
		buildCliLogger({}, "warn"); // handler pass — config level
		expect(createLoggerMock).toHaveBeenNthCalledWith(2, { level: "warn" });
		expect(getRunId()).toBe("run-2");
	});

	it("does not let a config level override an active --quiet flag", () => {
		buildCliLogger({ quiet: true });
		buildCliLogger({ quiet: true }, "debug");
		expect(createLoggerMock).toHaveBeenCalledTimes(1);
		expect(createLoggerMock).toHaveBeenCalledWith({ level: "error" });
	});
});

describe("getLogger / getRunId", () => {
	it("getLogger lazily builds and shares the root", () => {
		const l1 = getLogger();
		const l2 = buildCliLogger({}).logger;
		expect(l1).toBe(l2);
		expect(createLoggerMock).toHaveBeenCalledTimes(1);
	});

	it("getRunId is undefined until a root is built", () => {
		expect(getRunId()).toBeUndefined();
		buildCliLogger({});
		expect(getRunId()).toBe("run-1");
	});
});
