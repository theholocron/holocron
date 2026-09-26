import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Isolates the module-level `createLogger()` call's env-var resolution
 * (SENTINEL_AXIOM_INGEST_TOKEN/AXIOM_DATASET) from the rest of
 * `handler.test.ts` — that file imports `./handler.js` once, statically, at
 * the top, so every one of its tests exercises whichever branch was true at
 * THAT single import (always "unset" locally/in CI, since neither var is
 * ever set there). Testing the "both set" branch needs a fresh module
 * evaluation with the env already stubbed beforehand — `vi.resetModules()` +
 * a dynamic `import()` per test, isolated in its own file so it never
 * disturbs the shared static import elsewhere.
 */

const createLoggerMock = vi.fn(() => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn().mockResolvedValue(undefined) },
	runId: "test-run-id",
}));

vi.mock("@theholocron/observability/logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@theholocron/github-client", () => ({ createInstallationClient: vi.fn() }));
vi.mock("./actions/commit-standards/lint-commits.js", () => ({ lintCommits: vi.fn() }));
vi.mock("./actions/capability-compliance/post-check-run.js", () => ({ postCheckRun: vi.fn() }));
vi.mock("./actions/commit-standards/post-commit-standards-check.js", () => ({ postCommitStandardsCheck: vi.fn() }));
vi.mock("./actions/capability-compliance/sync-properties.js", () => ({ syncPropertiesFromConfig: vi.fn() }));
vi.mock("./actions/dispatched-check/dispatch-check.js", () => ({ dispatchCheck: vi.fn() }));
vi.mock("./utils/validate-config.js", () => ({ validateConfig: vi.fn() }));
vi.mock("./utils/webhook.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./utils/webhook.js")>();
	return { ...actual, parseWebhookEvent: vi.fn() };
});

describe("handler.ts module load — SENTINEL_AXIOM_INGEST_TOKEN/AXIOM_DATASET resolution", () => {
	beforeEach(() => {
		vi.resetModules();
		createLoggerMock.mockClear();
		delete process.env.SENTINEL_AXIOM_INGEST_TOKEN;
		delete process.env.AXIOM_DATASET;
	});

	afterEach(() => {
		delete process.env.SENTINEL_AXIOM_INGEST_TOKEN;
		delete process.env.AXIOM_DATASET;
	});

	it("passes an explicit axiom config through when both env vars are set", async () => {
		process.env.SENTINEL_AXIOM_INGEST_TOKEN = "tok_abc";
		process.env.AXIOM_DATASET = "holocron-sentinel";

		await import("./handler.js");

		expect(createLoggerMock).toHaveBeenCalledWith({ axiom: { token: "tok_abc", dataset: "holocron-sentinel" } });
	});

	it("omits axiom config when either env var is unset", async () => {
		process.env.SENTINEL_AXIOM_INGEST_TOKEN = "tok_abc";
		// AXIOM_DATASET deliberately left unset.

		await import("./handler.js");

		expect(createLoggerMock).toHaveBeenCalledWith({});
	});
});
