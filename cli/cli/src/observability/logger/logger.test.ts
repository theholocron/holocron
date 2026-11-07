import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCliLogger, getRunId, GLOBAL_AXIOM_DATASET, resetCliLogger, resolveLogLevel } from "./logger.js";

const ENV_KEYS = [
	"HOLOCRON_LOG_LEVEL",
	"HOLOCRON_AXIOM_TOKEN",
	"AXIOM_TOKEN",
	"HOLOCRON_AXIOM_DATASET",
	"AXIOM_DATASET",
	"HOLOCRON_ORG",
	"CI",
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const createLoggerMock = vi.hoisted(() => vi.fn());
const getTokenMock = vi.hoisted(() => vi.fn<(account: string) => string | null>());
const resolveValueMock = vi.hoisted(() => vi.fn<(names: readonly string[]) => string | undefined>());

vi.mock("@theholocron/observability/logger", async (importActual) => {
	const actual = await importActual<typeof import("@theholocron/observability/logger")>();
	return {
		...actual,
		createLogger: createLoggerMock,
	};
});

vi.mock("../../auth.js", () => ({ keyring: { get: getTokenMock }, resolveValue: resolveValueMock }));

let seq = 0;
function fakeResult(level?: string) {
	const logger = { level, __fake: true, error: vi.fn(), child: vi.fn() };
	logger.child.mockReturnValue(logger);
	return { logger, runId: `run-${++seq}` };
}

beforeEach(() => {
	resetCliLogger();
	seq = 0;
	createLoggerMock.mockReset();
	createLoggerMock.mockImplementation((config?: { level?: string }) => fakeResult(config?.level));
	getTokenMock.mockReset();
	getTokenMock.mockReturnValue(null);
	resolveValueMock.mockReset();
	resolveValueMock.mockReturnValue(undefined);
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

describe("Holocron binding", () => {
	it("reads HOLOCRON_LOG_LEVEL", () => {
		process.env.HOLOCRON_LOG_LEVEL = "warn";
		expect(resolveLogLevel({}, "debug")).toBe("warn");
	});

	it("builds the root with the command bound", () => {
		const child = vi.fn();
		createLoggerMock.mockImplementationOnce(() => ({ logger: { child, __fake: true }, runId: "run-x" }));
		buildCliLogger({}, { command: "doctor" });
		expect(child).toHaveBeenCalledWith({ command: "doctor" });
		expect(getRunId()).toBe("run-x");
	});
});

describe("buildCliLogger — Axiom credentials", () => {
	it("does not touch the keyring when no dataset is configured anywhere", () => {
		buildCliLogger({});
		expect(getTokenMock).not.toHaveBeenCalled();
		expect(createLoggerMock).toHaveBeenCalledWith({});
	});

	it("passes env-var credentials straight through without a keyring lookup", () => {
		process.env.HOLOCRON_AXIOM_TOKEN = "env-token";
		process.env.HOLOCRON_AXIOM_DATASET = "holocron-ci";
		buildCliLogger({});
		expect(getTokenMock).not.toHaveBeenCalled();
		expect(createLoggerMock).toHaveBeenCalledWith({ axiom: { dataset: "holocron-ci", token: "env-token" } });
	});

	it("pairs a keyring token with the env dataset when the token env var is absent", () => {
		process.env.HOLOCRON_AXIOM_DATASET = "holocron-local";
		getTokenMock.mockImplementation((account) => (account === "axiom" ? "keyring-token" : null));
		buildCliLogger({});
		expect(createLoggerMock).toHaveBeenCalledWith({
			axiom: { dataset: "holocron-local", token: "keyring-token" },
		});
	});

	it("prefers the org-namespaced keyring account over the bare one", () => {
		process.env.HOLOCRON_AXIOM_DATASET = "holocron-local";
		getTokenMock.mockImplementation((account) => (account === "axiom.theholocron" ? "scoped-token" : "bare-token"));
		buildCliLogger({}, { org: "theholocron" });
		expect(getTokenMock).toHaveBeenCalledWith("axiom.theholocron");
		expect(createLoggerMock).toHaveBeenCalledWith({
			axiom: { dataset: "holocron-local", token: "scoped-token" },
		});
	});

	it("rebuilds once to fold in the config dataset the middleware pass could not see", () => {
		getTokenMock.mockReturnValue("keyring-token");
		buildCliLogger({}); // middleware — no config
		expect(createLoggerMock).toHaveBeenNthCalledWith(1, {});
		buildCliLogger({}, { configAxiomDataset: "holocron-local", org: "theholocron" });
		expect(createLoggerMock).toHaveBeenNthCalledWith(2, {
			axiom: { dataset: "holocron-local", token: "keyring-token" },
		});
		expect(getRunId()).toBe("run-2");
	});

	it("does not ship to Axiom when a dataset is set but no token can be found", () => {
		process.env.HOLOCRON_AXIOM_DATASET = "holocron-local";
		getTokenMock.mockReturnValue(null);
		buildCliLogger({});
		expect(createLoggerMock).toHaveBeenCalledWith({});
	});
});

describe("buildCliLogger — one dataset name through the credential chain", () => {
	it("pairs a keyring token with the vendor-native AXIOM_DATASET when no HOLOCRON_ one is set", () => {
		process.env.AXIOM_DATASET = "vendor-ds";
		getTokenMock.mockReturnValue("keyring-token");
		buildCliLogger({});
		expect(createLoggerMock).toHaveBeenCalledWith({ axiom: { dataset: "vendor-ds", token: "keyring-token" } });
	});

	it("prefers HOLOCRON_AXIOM_DATASET (the local override) over AXIOM_DATASET", () => {
		process.env.HOLOCRON_AXIOM_DATASET = "holocron-local";
		process.env.AXIOM_DATASET = "holocron-ci";
		getTokenMock.mockReturnValue("keyring-token");
		buildCliLogger({});
		expect(createLoggerMock).toHaveBeenCalledWith({ axiom: { dataset: "holocron-local", token: "keyring-token" } });
		expect(resolveValueMock).not.toHaveBeenCalled();
	});

	it("keeps the config dataset ahead of the credential chain, so a local run stays on holocron-local", () => {
		resolveValueMock.mockReturnValue("holocron-ci");
		getTokenMock.mockReturnValue("keyring-token");
		buildCliLogger({}, { configAxiomDataset: "holocron-local" });
		expect(createLoggerMock).toHaveBeenCalledWith({ axiom: { dataset: "holocron-local", token: "keyring-token" } });
		expect(resolveValueMock).not.toHaveBeenCalled();
	});

	it("falls back to the credential chain (the 1Password-synced AXIOM_DATASET) when env and config have none", () => {
		resolveValueMock.mockReturnValue("holocron-ci");
		getTokenMock.mockReturnValue("keyring-token");
		buildCliLogger({});
		expect(resolveValueMock).toHaveBeenCalledWith(["HOLOCRON_AXIOM_DATASET", "AXIOM_DATASET"]);
		expect(createLoggerMock).toHaveBeenCalledWith({ axiom: { dataset: "holocron-ci", token: "keyring-token" } });
	});

	it("asks the credential chain for the prefixed name first, then the bare one", () => {
		getTokenMock.mockReturnValue("keyring-token");
		buildCliLogger({});
		expect(resolveValueMock).toHaveBeenCalledWith(["HOLOCRON_AXIOM_DATASET", "AXIOM_DATASET"]);
	});

	it("a global-context command never asks the credential chain", () => {
		resolveValueMock.mockReturnValue("holocron-ci");
		getTokenMock.mockReturnValue("keyring-token");
		buildCliLogger({}, { command: "clone" });
		expect(resolveValueMock).not.toHaveBeenCalled();
	});
});

describe("buildCliLogger — Axiom dataset scoping by execution context (ADR-0012)", () => {
	it("a global-context command always uses GLOBAL_AXIOM_DATASET, ignoring the env dataset", () => {
		process.env.HOLOCRON_AXIOM_DATASET = "rando-local";
		getTokenMock.mockReturnValue("keyring-token");
		buildCliLogger({}, { command: "clone" });
		expect(createLoggerMock).toHaveBeenCalledWith({
			axiom: { dataset: GLOBAL_AXIOM_DATASET, token: "keyring-token" },
		});
	});

	it("a global-context command still honors an env-var token — only the dataset is forced", () => {
		process.env.HOLOCRON_AXIOM_TOKEN = "env-token";
		process.env.HOLOCRON_AXIOM_DATASET = "rando-local";
		buildCliLogger({}, { command: "auth set" });
		expect(getTokenMock).not.toHaveBeenCalled();
		expect(createLoggerMock).toHaveBeenCalledWith({
			axiom: { dataset: GLOBAL_AXIOM_DATASET, token: "env-token" },
		});
	});

	it("a repo-aware/workspace command is unaffected — still uses the env/config dataset", () => {
		process.env.HOLOCRON_AXIOM_DATASET = "rando-local";
		getTokenMock.mockReturnValue("keyring-token");
		buildCliLogger({}, { command: "doctor" });
		expect(createLoggerMock).toHaveBeenCalledWith({
			axiom: { dataset: "rando-local", token: "keyring-token" },
		});
	});

	it("an unrecognised command name is treated as not-global (unchanged chain)", () => {
		process.env.HOLOCRON_AXIOM_DATASET = "rando-local";
		getTokenMock.mockReturnValue("keyring-token");
		buildCliLogger({}, { command: "some-future-command" });
		expect(createLoggerMock).toHaveBeenCalledWith({
			axiom: { dataset: "rando-local", token: "keyring-token" },
		});
	});
});
