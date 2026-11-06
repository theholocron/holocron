import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { allowProgress, progressEnabled } from "../../ui/index.js";
import { createCliLogger } from "./create-cli-logger.js";

const ENV_KEYS = ["ACME_LOG_LEVEL", "CI"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const createLoggerMock = vi.hoisted(() => vi.fn());
const resolveAxiomMock = vi.hoisted(() => vi.fn());

vi.mock("@theholocron/observability/logger", async (importActual) => {
	const actual = await importActual<typeof import("@theholocron/observability/logger")>();
	return {
		...actual,
		createLogger: createLoggerMock,
	};
});

let seq = 0;
function fakeResult(level?: string) {
	const logger = { level, __fake: true, error: vi.fn(), child: vi.fn() };
	logger.child.mockReturnValue(logger);
	return { logger, runId: `run-${++seq}` };
}

const { buildCliLogger, getLogger, getRunId, reportError, resetCliLogger, resolveLogLevel } = createCliLogger({
	envPrefix: "ACME",
	resolveAxiom: resolveAxiomMock,
});

beforeEach(() => {
	resetCliLogger();
	seq = 0;
	createLoggerMock.mockReset();
	createLoggerMock.mockImplementation((config?: { level?: string }) => fakeResult(config?.level));
	resolveAxiomMock.mockReset();
	resolveAxiomMock.mockReturnValue(undefined);
	for (const key of ENV_KEYS) delete process.env[key];
	// Pin isCI() to true by default so every existing assertion below (which
	// predates consoleOutput and asserts an exact createLogger call shape)
	// stays deterministic — resolveConsoleOutput returns undefined in CI,
	// so it's omitted from the call just like before this field existed.
	// The dedicated "consoleOutput" describe block below overrides this.
	process.env.CI = "true";
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

	it("reads ACME_LOG_LEVEL when no flag is set", () => {
		process.env.ACME_LOG_LEVEL = "warn";
		expect(resolveLogLevel({})).toBe("warn");
	});

	it("ACME_LOG_LEVEL outranks the config level", () => {
		process.env.ACME_LOG_LEVEL = "warn";
		expect(resolveLogLevel({}, "debug")).toBe("warn");
	});

	it("falls back to the config level, then undefined", () => {
		expect(resolveLogLevel({}, "error")).toBe("error");
		expect(resolveLogLevel({})).toBeUndefined();
	});

	it("ignores an unrecognised ACME_LOG_LEVEL", () => {
		process.env.ACME_LOG_LEVEL = "loud";
		expect(resolveLogLevel({}, "info")).toBe("info");
	});

	it("--log outranks --verbose, --quiet, the env var, and the config level", () => {
		process.env.ACME_LOG_LEVEL = "warn";
		expect(resolveLogLevel({ log: "error", verbose: true, quiet: true }, "debug")).toBe("error");
	});
});

describe("buildCliLogger", () => {
	it("builds once and returns the memoized root on repeat calls", () => {
		const a = buildCliLogger({});
		const b = buildCliLogger({});
		expect(a).toBe(b);
		expect(createLoggerMock).toHaveBeenCalledTimes(1);
	});

	it("turns the progress spinner off for --quiet and --log, and on again without them", () => {
		const tty = (v: boolean) => {
			Object.defineProperty(process.stdout, "isTTY", { value: v, configurable: true });
			Object.defineProperty(process.stderr, "isTTY", { value: v, configurable: true });
		};
		tty(true);
		delete process.env["CI"];
		try {
			buildCliLogger({ quiet: true });
			expect(progressEnabled()).toBe(false);
			buildCliLogger({ log: "info" });
			expect(progressEnabled()).toBe(false);
			buildCliLogger({});
			expect(progressEnabled()).toBe(true);
		} finally {
			tty(false);
			allowProgress(true);
		}
	});

	it("passes the resolved flag level through to createLogger", () => {
		buildCliLogger({ verbose: true });
		expect(createLoggerMock).toHaveBeenCalledWith({ level: "debug", consoleOutput: true });
	});

	it("rebuilds once with the config level when the flag/env pass had none", () => {
		buildCliLogger({}); // middleware pass — no level
		buildCliLogger({}, { configLevel: "warn" }); // handler pass — config level
		expect(createLoggerMock).toHaveBeenNthCalledWith(2, { level: "warn" });
		expect(getRunId()).toBe("run-2");
	});

	it("does not let a config level override an active --quiet flag", () => {
		buildCliLogger({ quiet: true });
		buildCliLogger({ quiet: true }, { configLevel: "debug" });
		expect(createLoggerMock).toHaveBeenCalledTimes(1);
		expect(createLoggerMock).toHaveBeenCalledWith({ level: "error", consoleOutput: true });
	});

	it("does not let a config level override an active --log flag", () => {
		buildCliLogger({ log: "warn" });
		buildCliLogger({ log: "warn" }, { configLevel: "debug" });
		expect(createLoggerMock).toHaveBeenCalledTimes(1);
	});

	it("passes consoleOutput: false by default outside CI", () => {
		delete process.env.CI;
		buildCliLogger({});
		expect(createLoggerMock).toHaveBeenCalledWith({ consoleOutput: false });
	});

	it("maps --log to both the level and consoleOutput: true", () => {
		delete process.env.CI;
		buildCliLogger({ log: "warn" });
		expect(createLoggerMock).toHaveBeenCalledWith({ level: "warn", consoleOutput: true });
	});

	it("--log outranks --verbose and --quiet for the resolved level", () => {
		delete process.env.CI;
		buildCliLogger({ log: "error", verbose: true });
		expect(createLoggerMock).toHaveBeenCalledWith({ level: "error", consoleOutput: true });
	});

	it("omits consoleOutput entirely in CI, regardless of flags", () => {
		process.env.CI = "true";
		buildCliLogger({});
		expect(createLoggerMock).toHaveBeenCalledWith({});
	});

	it("binds the command name on the root logger", () => {
		const child = vi.fn();
		createLoggerMock.mockImplementationOnce(() => ({
			logger: { child, __fake: true },
			runId: "run-x",
		}));
		buildCliLogger({}, { command: "doctor" });
		expect(child).toHaveBeenCalledWith({ command: "doctor" });
	});
});

describe("buildCliLogger — default Axiom resolution", () => {
	it("falls back to the package's env-based resolver when none is injected", () => {
		const plain = createCliLogger({ envPrefix: "ACME" });
		process.env.AXIOM_TOKEN = "t";
		process.env.AXIOM_DATASET = "d";
		try {
			plain.buildCliLogger({});
			expect(createLoggerMock).toHaveBeenCalledWith({ axiom: { dataset: "d", token: "t" } });
		} finally {
			delete process.env.AXIOM_TOKEN;
			delete process.env.AXIOM_DATASET;
		}
	});
});

describe("buildCliLogger — Axiom resolution", () => {
	it("passes the resolved credentials to createLogger", () => {
		resolveAxiomMock.mockReturnValue({ dataset: "ds", token: "tok" });
		buildCliLogger({});
		expect(createLoggerMock).toHaveBeenCalledWith({ axiom: { dataset: "ds", token: "tok" } });
	});

	it("hands the resolver the opts and the command in effect", () => {
		buildCliLogger({}, { command: "doctor", org: "acme" });
		expect(resolveAxiomMock).toHaveBeenLastCalledWith({ command: "doctor", org: "acme" }, { command: "doctor" });
	});

	it("remembers the command from an earlier build", () => {
		buildCliLogger({}, { command: "doctor" });
		buildCliLogger({}, { configLevel: "warn" });
		expect(resolveAxiomMock).toHaveBeenLastCalledWith({ configLevel: "warn" }, { command: "doctor" });
	});

	it("rebuilds once when a new dataset appears, but not for the same one", () => {
		buildCliLogger({});
		resolveAxiomMock.mockReturnValue({ dataset: "ds", token: "tok" });
		buildCliLogger({});
		buildCliLogger({});
		expect(createLoggerMock).toHaveBeenCalledTimes(2);
		expect(getRunId()).toBe("run-2");
	});
});

describe("getLogger / getRunId", () => {
	it("getLogger lazily builds and shares the root", () => {
		const l1 = getLogger();
		const l2 = buildCliLogger({}).logger;
		expect(l1).toBe(l2);
		expect(createLoggerMock).toHaveBeenCalledTimes(1);
	});

	it("getLogger's bare fallback is quiet by default outside CI — not createLogger's own auto-detection", () => {
		delete process.env.CI;
		getLogger();
		expect(createLoggerMock).toHaveBeenCalledWith({ consoleOutput: false });
	});

	it("getLogger's bare fallback omits consoleOutput in CI, preserving auto-detection", () => {
		process.env.CI = "true";
		getLogger();
		expect(createLoggerMock).toHaveBeenCalledWith({});
	});

	it("getRunId is undefined until a root is built", () => {
		expect(getRunId()).toBeUndefined();
		buildCliLogger({});
		expect(getRunId()).toBe("run-1");
	});
});

describe("reportError", () => {
	it("prints via console.error and also logs at error level — always visible regardless of consoleOutput", () => {
		const errorSpy = vi.fn();
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		reportError("boom", { error: errorSpy } as never);
		expect(errorSpy).toHaveBeenCalledWith("boom");
		expect(consoleSpy).toHaveBeenCalledTimes(1);
		expect(String(consoleSpy.mock.calls[0]?.[0])).toContain("boom");
		consoleSpy.mockRestore();
	});

	it("defaults to getLogger() when no logger is passed", () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => reportError("fallback message")).not.toThrow();
		expect(consoleSpy).toHaveBeenCalledTimes(1);
		consoleSpy.mockRestore();
	});
});
