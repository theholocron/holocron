import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeFlush, createLoggerCalls, resolveAxiomConfigCalls, FAKE_AXIOM_CONFIG } = vi.hoisted(() => ({
	fakeFlush: vi.fn().mockResolvedValue(undefined),
	// Recorded once, at the single static import of ./handler.js below. Plain
	// arrays (not vi.fn()s) so the per-test mockReset()s can't clear them.
	createLoggerCalls: [] as unknown[][],
	resolveAxiomConfigCalls: [] as unknown[][],
	FAKE_AXIOM_CONFIG: { axiom: { token: "tok_test", dataset: "ds_test" } },
}));

vi.mock("@theholocron/observability/logger", () => ({
	createLogger: (...args: unknown[]) => {
		createLoggerCalls.push(args);
		return {
			logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: fakeFlush },
			runId: "test-run-id",
		};
	},
}));
vi.mock("../utils/axiom-config/axiom-config.js", () => ({
	resolveAxiomConfig: (...args: unknown[]) => {
		resolveAxiomConfigCalls.push(args);
		return FAKE_AXIOM_CONFIG;
	},
}));
vi.mock("@theholocron/github-client", () => ({ createInstallationClient: vi.fn() }));
vi.mock("../actions/auto-fix-loop/find-auto-fix-loop/find-auto-fix-loop.js", () => ({ findAutoFixLoop: vi.fn() }));
vi.mock("../actions/auto-fix-loop/post-auto-fix-loop-comment/post-auto-fix-loop-comment.js", () => ({
	postAutoFixLoopComment: vi.fn(),
}));
vi.mock("../actions/commit-standards/lint-commits/lint-commits.js", () => ({ lintCommits: vi.fn() }));
vi.mock("../actions/actionlint/lint-actionlint/lint-actionlint.js", () => ({ lintActionlint: vi.fn() }));
vi.mock("../actions/actionlint/post-actionlint-check/post-actionlint-check.js", () => ({
	postActionlintCheck: vi.fn(),
}));
vi.mock("../actions/capability-compliance/post-check-run/post-check-run.js", () => ({ postCheckRun: vi.fn() }));
vi.mock("../actions/commit-standards/post-commit-standards-check/post-commit-standards-check.js", () => ({
	postCommitStandardsCheck: vi.fn(),
}));
vi.mock("../actions/capability-compliance/sync-properties/sync-properties.js", () => ({
	syncPropertiesFromConfig: vi.fn(),
}));
vi.mock("../actions/dco/lint-dco/lint-dco.js", () => ({ lintDco: vi.fn() }));
vi.mock("../actions/dco/post-dco-check/post-dco-check.js", () => ({ postDcoCheck: vi.fn() }));
vi.mock("../actions/dispatched-check/dispatch-check/dispatch-check.js", () => ({ dispatchCheck: vi.fn() }));
vi.mock("../actions/editorconfig/commit-editorconfig-fix/commit-editorconfig-fix.js", () => ({
	commitEditorConfigFix: vi.fn(),
}));
vi.mock("../actions/editorconfig/lint-editorconfig/lint-editorconfig.js", () => ({ lintEditorConfig: vi.fn() }));
vi.mock("../actions/editorconfig/post-editorconfig-check/post-editorconfig-check.js", () => ({
	postEditorConfigCheck: vi.fn(),
}));
vi.mock("../actions/formatting/commit-formatting-fix/commit-formatting-fix.js", () => ({
	commitFormattingFix: vi.fn(),
}));
vi.mock("../actions/formatting/lint-formatting/lint-formatting.js", () => ({ lintFormatting: vi.fn() }));
vi.mock("../actions/formatting/post-auto-fix-comment/post-auto-fix-comment.js", () => ({
	postAutoFixComment: vi.fn(),
}));
vi.mock("../actions/formatting/post-formatting-check/post-formatting-check.js", () => ({
	postFormattingCheck: vi.fn(),
}));
vi.mock("../actions/markdown-lint/commit-markdown-lint-fix/commit-markdown-lint-fix.js", () => ({
	commitMarkdownLintFix: vi.fn(),
}));
vi.mock("../actions/markdown-lint/lint-markdown/lint-markdown.js", () => ({ lintMarkdown: vi.fn() }));
vi.mock("../actions/markdown-lint/post-markdown-lint-check/post-markdown-lint-check.js", () => ({
	postMarkdownLintCheck: vi.fn(),
}));
vi.mock("../actions/pr-config-validation/post-pr-config-validation-check/post-pr-config-validation-check.js", () => ({
	postPrConfigValidationCheck: vi.fn(),
}));
vi.mock("../actions/repo-validation/post-adrs-check/post-adrs-check.js", () => ({ postAdrsCheck: vi.fn() }));
vi.mock("../actions/repo-validation/post-docs-presence-check/post-docs-presence-check.js", () => ({
	postDocsPresenceCheck: vi.fn(),
}));
vi.mock("../actions/repo-validation/validate-adrs/validate-adrs.js", () => ({ validateAdrs: vi.fn() }));
vi.mock("../actions/repo-validation/validate-docs-presence/validate-docs-presence.js", () => ({
	validateDocsPresence: vi.fn(),
}));
vi.mock("../actions/pr-feed/run-pr-feed/run-pr-feed.js", () => ({ runPrFeed: vi.fn() }));
vi.mock("../actions/role-sync/run-role-sync/run-role-sync.js", () => ({ runRoleSync: vi.fn() }));
vi.mock("../actions/static-analysis/lint-static-analysis/lint-static-analysis.js", () => ({
	lintStaticAnalysis: vi.fn(),
}));
vi.mock("../actions/static-analysis/post-static-analysis-check/post-static-analysis-check.js", () => ({
	postStaticAnalysisCheck: vi.fn(),
}));
vi.mock("../utils/validate-config/validate-config.js", () => ({ validateConfig: vi.fn() }));
vi.mock("../utils/webhook/webhook.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../utils/webhook/webhook.js")>();
	return { ...actual, parseWebhookEvent: vi.fn() };
});

import { createInstallationClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

import {
	commitEditorConfigFix,
	commitFormattingFix,
	commitMarkdownLintFix,
	dispatchCheck,
	findAutoFixLoop,
	lintActionlint,
	lintCommits,
	lintDco,
	lintEditorConfig,
	lintFormatting,
	lintMarkdown,
	lintStaticAnalysis,
	postActionlintCheck,
	postAdrsCheck,
	postAutoFixComment,
	postAutoFixLoopComment,
	postCheckRun,
	postCommitStandardsCheck,
	postDcoCheck,
	postDocsPresenceCheck,
	postEditorConfigCheck,
	postFormattingCheck,
	postMarkdownLintCheck,
	postPrConfigValidationCheck,
	postStaticAnalysisCheck,
	runPrFeed,
	runRoleSync,
	syncPropertiesFromConfig,
	validateAdrs,
	validateDocsPresence,
} from "../actions/index.js";
import { parseWebhookEvent, validateConfig, WebhookVerificationError } from "../utils/index.js";
import { handleWebhookRequest } from "./handler.js";
import type { Env } from "./handler.type.js";

const ENV: Env = {
	SENTINEL_GITHUB_APP_ID: "123456",
	// createInstallationClient is mocked below — this never gets parsed as a
	// real PEM, so a plain placeholder avoids gitleaks flagging the literal
	// dash-wrapped PEM delimiter pattern in test fixtures.
	SENTINEL_GITHUB_APP_PRIVATE_KEY: "fake-private-key-for-tests",
	SENTINEL_WEBHOOK_SECRET: "test-secret",
};

const FAKE_CLIENT = { checks: {}, git: {}, properties: {} };

function req(body = "{}", method = "POST"): Request {
	return new Request("https://sentinel.example.com/webhook", {
		method,
		...(method === "GET" || method === "HEAD" ? {} : { body }),
	});
}

beforeEach(() => {
	vi.mocked(parseWebhookEvent).mockReset();
	vi.mocked(createInstallationClient).mockReset();
	vi.mocked(validateConfig).mockReset();
	vi.mocked(syncPropertiesFromConfig).mockReset();
	vi.mocked(postCheckRun).mockReset();
	vi.mocked(lintCommits).mockReset();
	vi.mocked(postCommitStandardsCheck).mockReset();
	vi.mocked(lintDco).mockReset();
	vi.mocked(postDcoCheck).mockReset();
	vi.mocked(dispatchCheck).mockReset();
	vi.mocked(lintFormatting).mockReset();
	vi.mocked(postFormattingCheck).mockReset();
	vi.mocked(lintMarkdown).mockReset();
	vi.mocked(postMarkdownLintCheck).mockReset();
	vi.mocked(commitFormattingFix).mockReset();
	vi.mocked(postPrConfigValidationCheck).mockReset();
	vi.mocked(postAutoFixComment).mockReset();
	vi.mocked(lintStaticAnalysis).mockReset();
	vi.mocked(postStaticAnalysisCheck).mockReset();
	vi.mocked(lintActionlint).mockReset();
	vi.mocked(validateAdrs).mockReset();
	vi.mocked(postAdrsCheck).mockReset();
	vi.mocked(validateDocsPresence).mockReset();
	vi.mocked(postDocsPresenceCheck).mockReset();
	vi.mocked(postActionlintCheck).mockReset();
	vi.mocked(lintEditorConfig).mockReset();
	vi.mocked(postEditorConfigCheck).mockReset();
	vi.mocked(commitEditorConfigFix).mockReset();
	vi.mocked(commitMarkdownLintFix).mockReset();
	vi.mocked(runRoleSync).mockReset();
	vi.mocked(runPrFeed).mockReset();
	vi.mocked(findAutoFixLoop).mockReset();
	vi.mocked(findAutoFixLoop).mockResolvedValue({ blocked: [] });
	vi.mocked(postAutoFixLoopComment).mockReset();
	vi.mocked(postAutoFixLoopComment).mockResolvedValue({ posted: true });
	fakeFlush.mockClear();
});

describe("handler — module-level logger (holocron#780/#781)", () => {
	// What resolveAxiomConfig() returns for each env-var combination is tested
	// directly in utils/axiom-config.test.ts; this is only the wiring.
	it("builds its logger from resolveAxiomConfig(env), passing the result through unchanged", () => {
		expect(resolveAxiomConfigCalls).toHaveLength(1);
		expect(typeof (resolveAxiomConfigCalls[0]![0] as { get: unknown }).get).toBe("function");

		expect(createLoggerCalls).toHaveLength(1);
		expect(createLoggerCalls[0]![0]).toBe(FAKE_AXIOM_CONFIG);
	});
});

describe("handler — method + verification", () => {
	it("rejects non-POST requests with 405", async () => {
		const res = await handleWebhookRequest(req("{}", "GET"), ENV);
		expect(res.status).toBe(405);
	});

	it("returns 401 with the error message when signature verification fails", async () => {
		vi.mocked(parseWebhookEvent).mockImplementation(() => {
			throw new WebhookVerificationError("X-Hub-Signature-256 verification failed");
		});
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(401);
		expect(await res.text()).toBe("X-Hub-Signature-256 verification failed");
	});

	it("catches a non-WebhookVerificationError from parseWebhookEvent, logs it, and returns 500 instead of crashing unhandled", async () => {
		// The read-only-filesystem ENOENT crash previously reached the caller
		// as an unhandled rejection with nothing logged anywhere -- the
		// top-level try/catch in handleWebhookRequest() exists specifically so
		// an unexpected failure like this one is observable instead of silent.
		vi.mocked(parseWebhookEvent).mockImplementation(() => {
			throw new Error("something else entirely");
		});
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ handled: false, reason: "internal error" });
	});

	it("includes status and details in the log for a ProviderApiError, not just the generic message", async () => {
		// A ProviderApiError's own .message is a generic template ("GitHub
		// PATCH ... -> 422") -- .status and .details (the raw response body)
		// are what actually explain a 4xx/5xx and aren't part of the base
		// Error interface, so a plain { message, stack } log silently drops
		// them. Found live: theholocron/clients's syncPropertiesFromConfig
		// hit a real 422 with no way to see why until this was added.
		vi.mocked(parseWebhookEvent).mockImplementation(() => {
			throw new ProviderApiError(
				"GitHub PATCH /repos/acme/demo/properties/values → 422",
				422,
				'{"message":"..."}'
			);
		});
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ handled: false, reason: "internal error" });
	});

	it("falls back to String(err) in the log when a non-Error value is thrown", async () => {
		// loadConfigFromContent only ever throws real Error instances in
		// practice (validate-config.non-error.test.ts covers that same
		// defensive fallback one layer down) -- this covers the equivalent
		// String(err) branch here, for a hypothetical non-Error throw from
		// anywhere else in the handle() call chain.
		vi.mocked(parseWebhookEvent).mockImplementation(() => {
			throw "a plain string, not an Error";
		});
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ handled: false, reason: "internal error" });
	});
});

describe("handler — logger.flush() (Axiom worker-thread transport)", () => {
	it("flushes once on the unhandled-error path -- the very line just logged must not get lost", async () => {
		vi.mocked(parseWebhookEvent).mockImplementation(() => {
			throw new Error("something else entirely");
		});
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(500);
		expect(fakeFlush).toHaveBeenCalledTimes(1);
	});

	it("flushes once on a normal successful response too", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: false,
			reason: "unrelated event",
			githubEvent: "issues",
		});
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(200);
		expect(fakeFlush).toHaveBeenCalledTimes(1);
	});

	it("a flush() rejection is swallowed -- an observability gap never turns a successful response into a 500", async () => {
		fakeFlush.mockRejectedValueOnce(new Error("Axiom unreachable"));
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: false,
			reason: "unrelated event",
			githubEvent: "issues",
		});
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ handled: false, reason: "unrelated event" });
	});
});

describe("handler — unhandled and installation events", () => {
	it("returns 200 with the reason when the delivery isn't handled", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: false,
			reason: "push to a non-default branch",
			githubEvent: "push",
		});
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ handled: false, reason: "push to a non-default branch" });
		expect(createInstallationClient).not.toHaveBeenCalled();
	});

	it("acknowledges installation.created without resolving a client", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: { type: "installation.created", installationId: 1, raw: {} },
		});
		const res = await handleWebhookRequest(req(), ENV);
		expect(await res.json()).toEqual({ handled: true, type: "installation.created" });
		expect(createInstallationClient).not.toHaveBeenCalled();
	});

	it("acknowledges installation.deleted without resolving a client", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: { type: "installation.deleted", installationId: 1, raw: {} },
		});
		const res = await handleWebhookRequest(req(), ENV);
		expect(await res.json()).toEqual({ handled: true, type: "installation.deleted" });
	});
});

describe("handler — defensive guards", () => {
	it("returns handled:false when a repo-scoped event somehow carries no repo", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: { type: "push.default-branch", installationId: 1, raw: {} },
		});
		const res = await handleWebhookRequest(req(), ENV);
		expect(await res.json()).toEqual({ handled: false, reason: "push.default-branch: no repo in event" });
	});

	it("returns handled:false when the payload is missing default_branch or a commit SHA", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: { type: "push.default-branch", repo: "acme/demo", installationId: 1, raw: {} },
		});
		const res = await handleWebhookRequest(req(), ENV);
		const body = (await res.json()) as { handled: boolean; reason: string };
		expect(body.handled).toBe(false);
		expect(body.reason).toMatch(/payload missing/);
		expect(createInstallationClient).not.toHaveBeenCalled();
	});
});

describe("handler — the App's credentials", () => {
	const pushEvent = {
		handled: true,
		event: {
			type: "push.default-branch",
			repo: "acme/demo",
			installationId: 42,
			raw: { repository: { default_branch: "main" }, after: "sha-after" },
		},
	} as never;

	it("still reads the bare GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY a deployment set before the rename", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue(pushEvent);
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(validateConfig).mockResolvedValue({ status: "missing" } as never);

		await handleWebhookRequest(req(), {
			SENTINEL_WEBHOOK_SECRET: "test-secret",
			GITHUB_APP_ID: "7",
			GITHUB_APP_PRIVATE_KEY: "old-key",
		});

		expect(createInstallationClient).toHaveBeenCalledWith({ appId: "7", privateKey: "old-key" }, 42);
	});

	it("answers 500 and makes no client when neither spelling of the App id is set", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue(pushEvent);

		const res = await handleWebhookRequest(req(), { SENTINEL_WEBHOOK_SECRET: "test-secret" });

		expect(res.status).toBe(500);
		expect(createInstallationClient).not.toHaveBeenCalled();
	});
});

describe("handler — push.default-branch full pipeline", () => {
	it("runs validateConfig → syncPropertiesFromConfig → postCheckRun and returns the check run", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: {
				type: "push.default-branch",
				repo: "acme/demo",
				installationId: 42,
				raw: { repository: { default_branch: "main" }, after: "sha-after" },
			},
		});
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(validateConfig).mockResolvedValue({
			status: "valid",
			filepath: "holocron.config.json",
			config: { tasks: [] },
		});
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({
			properties: { holocron_capabilities: ["source", "ci"], monorepo: "false" },
		});
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 7, conclusion: "success", htmlUrl: "https://x" });

		const res = await handleWebhookRequest(req(), ENV);

		expect(createInstallationClient).toHaveBeenCalledWith(
			{ appId: ENV.SENTINEL_GITHUB_APP_ID, privateKey: ENV.SENTINEL_GITHUB_APP_PRIVATE_KEY },
			42
		);
		expect(validateConfig).toHaveBeenCalledWith({ client: FAKE_CLIENT, repo: "acme/demo" });
		expect(syncPropertiesFromConfig).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			defaultBranch: "main",
			config: { tasks: [] },
		});
		expect(postCheckRun).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			headSha: "sha-after",
			capabilities: ["source", "ci"],
			runId: "test-run-id",
		});
		expect(await res.json()).toEqual({
			handled: true,
			type: "push.default-branch",
			checkRun: { checkRunId: 7, conclusion: "success", htmlUrl: "https://x" },
		});
		// Commit standards is pull_request-only -- a push has no PR commits to
		// fetch, and capability compliance already covers push separately.
		expect(lintCommits).not.toHaveBeenCalled();
		expect(postCommitStandardsCheck).not.toHaveBeenCalled();
	});

	it("skips properties sync and the check run when config isn't valid", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: {
				type: "push.default-branch",
				repo: "acme/demo",
				installationId: 42,
				raw: { repository: { default_branch: "main" }, after: "sha-after" },
			},
		});
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(validateConfig).mockResolvedValue({ status: "no-config" });

		const res = await handleWebhookRequest(req(), ENV);

		expect(syncPropertiesFromConfig).not.toHaveBeenCalled();
		expect(postCheckRun).not.toHaveBeenCalled();
		expect(await res.json()).toEqual({ handled: true, type: "push.default-branch", config: "no-config" });
	});

	it("defaults capabilities to [] when holocron_capabilities isn't an array", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: {
				type: "push.default-branch",
				repo: "acme/demo",
				installationId: 42,
				raw: { repository: { default_branch: "main" }, after: "sha-after" },
			},
		});
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: { tasks: [] } });
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed for the defensive-guard test
			properties: { holocron_capabilities: "not-actually-an-array" as any },
		});
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "failure", htmlUrl: "" });

		await handleWebhookRequest(req(), ENV);

		expect(postCheckRun).toHaveBeenCalledWith(expect.objectContaining({ capabilities: [] }));
	});
});

describe("handler — pull_request pipeline", () => {
	it("uses pull_request.head.sha as the check run's commit", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: {
				type: "pull_request.opened",
				repo: "acme/demo",
				installationId: 42,
				raw: { repository: { default_branch: "main" }, pull_request: { head: { sha: "pr-head-sha" } } },
			},
		});
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: { tasks: [] } });
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 2, conclusion: "failure", htmlUrl: "" });

		await handleWebhookRequest(req(), ENV);

		expect(postCheckRun).toHaveBeenCalledWith(expect.objectContaining({ headSha: "pr-head-sha" }));
	});
});

describe("handler — commit standards pipeline (holocron#769/#771)", () => {
	function prEvent(type: "pull_request.opened" | "pull_request.synchronize") {
		return {
			type,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: { number: 9, head: { sha: "pr-head-sha" } },
			},
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: { tasks: [] } });
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	it("runs lintCommits with the PR number, and posts the result", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintCommits).mockResolvedValue({ valid: true, commitCount: 2, violations: [] });
		vi.mocked(postCommitStandardsCheck).mockResolvedValue({
			checkRunId: 5,
			conclusion: "success",
			htmlUrl: "https://x/5",
		});

		const res = await handleWebhookRequest(req(), ENV);

		expect(lintCommits).toHaveBeenCalledWith({ client: FAKE_CLIENT, repo: "acme/demo", pullNumber: 9 });
		expect(postCommitStandardsCheck).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			headSha: "pr-head-sha",
			result: { valid: true, commitCount: 2, violations: [] },
			runId: "test-run-id",
		});
		const body = (await res.json()) as { commitStandardsCheckRun: unknown };
		expect(body.commitStandardsCheckRun).toEqual({ checkRunId: 5, conclusion: "success", htmlUrl: "https://x/5" });
	});

	it("runs on pull_request.synchronize too, not just opened", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.synchronize") });
		vi.mocked(lintCommits).mockResolvedValue({ valid: true, commitCount: 1, violations: [] });
		vi.mocked(postCommitStandardsCheck).mockResolvedValue({ checkRunId: 6, conclusion: "success", htmlUrl: "" });

		await handleWebhookRequest(req(), ENV);

		expect(lintCommits).toHaveBeenCalled();
	});

	it("runs independent of validateConfig's result -- config invalid, commit standards still posts (D6: config-free)", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(validateConfig).mockResolvedValue({ status: "no-config" });
		vi.mocked(lintCommits).mockResolvedValue({
			valid: false,
			commitCount: 1,
			violations: [{ sha: "bad0001", rule: "subject-empty", message: "subject may not be empty" }],
		});
		vi.mocked(postCommitStandardsCheck).mockResolvedValue({ checkRunId: 7, conclusion: "failure", htmlUrl: "" });

		const res = await handleWebhookRequest(req(), ENV);

		expect(lintCommits).toHaveBeenCalled();
		expect(postCommitStandardsCheck).toHaveBeenCalled();
		expect(syncPropertiesFromConfig).not.toHaveBeenCalled();
		expect(postCheckRun).not.toHaveBeenCalled();
		const body = (await res.json()) as { commitStandardsCheckRun: unknown; config: string };
		expect(body.config).toBe("no-config");
		expect(body.commitStandardsCheckRun).toEqual({ checkRunId: 7, conclusion: "failure", htmlUrl: "" });
	});

	it("soft-skips a lintCommits failure -- capability compliance still posts, request still succeeds", async () => {
		// Real regression, found live: a real deploy where lintCommits()
		// threw (a module-resolution bug in an unrelated dependency) took
		// down the *entire* request with a bare 500, silently killing
		// capability compliance too -- a check that had nothing to do with
		// what actually broke, and worked fine before commit standards
		// existed. This is the fix: commit standards failing must never
		// take capability compliance down with it.
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintCommits).mockRejectedValue(new Error("Cannot find module (some unrelated failure)"));

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(postCommitStandardsCheck).not.toHaveBeenCalled();
		expect(syncPropertiesFromConfig).toHaveBeenCalled();
		expect(postCheckRun).toHaveBeenCalled();
		const body = (await res.json()) as { commitStandardsCheckRun: unknown; checkRun: unknown };
		expect(body.commitStandardsCheckRun).toBeUndefined();
		expect(body.checkRun).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});
});

describe("handler — DCO pipeline (holocron#900)", () => {
	function prEvent(type: "pull_request.opened" | "pull_request.synchronize") {
		return {
			type,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: { number: 9, head: { sha: "pr-head-sha", ref: "feature-branch" } },
			},
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: { tasks: [] } });
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	it("runs lintDco with the PR number, and posts the result", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintDco).mockResolvedValue({ valid: true, commitCount: 2, violations: [] });
		vi.mocked(postDcoCheck).mockResolvedValue({ checkRunId: 8, conclusion: "success", htmlUrl: "https://x/8" });

		const res = await handleWebhookRequest(req(), ENV);

		expect(lintDco).toHaveBeenCalledWith({ client: FAKE_CLIENT, repo: "acme/demo", pullNumber: 9 });
		expect(postDcoCheck).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			headSha: "pr-head-sha",
			result: { valid: true, commitCount: 2, violations: [] },
			runId: "test-run-id",
			headRef: "feature-branch",
		});
		const body = (await res.json()) as { dcoCheckRun: unknown };
		expect(body.dcoCheckRun).toEqual({ checkRunId: 8, conclusion: "success", htmlUrl: "https://x/8" });
	});

	it("soft-skips a lintDco failure -- capability compliance still posts, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintDco).mockRejectedValue(new Error("Cannot find module (some unrelated failure)"));

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(postDcoCheck).not.toHaveBeenCalled();
		expect(syncPropertiesFromConfig).toHaveBeenCalled();
		expect(postCheckRun).toHaveBeenCalled();
		const body = (await res.json()) as { dcoCheckRun: unknown; checkRun: unknown };
		expect(body.dcoCheckRun).toBeUndefined();
		expect(body.checkRun).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});
});

describe("handler — formatting pipeline (holocron#769/#819)", () => {
	function prEvent(type: "pull_request.opened" | "pull_request.synchronize") {
		return {
			type,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: { number: 9, head: { sha: "pr-head-sha" } },
			},
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: { tasks: [] } });
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	it("runs lintFormatting with the PR's ref, and posts the result", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintFormatting).mockResolvedValue({ valid: true, fileCount: 2, messages: [] });
		vi.mocked(postFormattingCheck).mockResolvedValue({
			checkRunId: 15,
			conclusion: "success",
			htmlUrl: "https://x/15",
		});

		const res = await handleWebhookRequest(req(), ENV);

		expect(lintFormatting).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			pullNumber: 9,
			ref: "pr-head-sha",
		});
		expect(postFormattingCheck).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			headSha: "pr-head-sha",
			result: { valid: true, fileCount: 2, messages: [] },
			runId: "test-run-id",
		});
		const body = (await res.json()) as { formattingCheckRun: unknown };
		expect(body.formattingCheckRun).toEqual({ checkRunId: 15, conclusion: "success", htmlUrl: "https://x/15" });
	});

	it("runs on pull_request.synchronize too, not just opened", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.synchronize") });
		vi.mocked(lintFormatting).mockResolvedValue({ valid: true, fileCount: 1, messages: [] });
		vi.mocked(postFormattingCheck).mockResolvedValue({ checkRunId: 16, conclusion: "success", htmlUrl: "" });

		await handleWebhookRequest(req(), ENV);

		expect(lintFormatting).toHaveBeenCalled();
	});

	it("soft-skips a lintFormatting failure -- other checks still post, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintFormatting).mockRejectedValue(new Error("Cannot find module (some unrelated failure)"));

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(postFormattingCheck).not.toHaveBeenCalled();
		expect(syncPropertiesFromConfig).toHaveBeenCalled();
		expect(postCheckRun).toHaveBeenCalled();
		const body = (await res.json()) as { formattingCheckRun: unknown; checkRun: unknown };
		expect(body.formattingCheckRun).toBeUndefined();
		expect(body.checkRun).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});
});

describe("handler — markdown lint pipeline (holocron#769/#821)", () => {
	function prEvent(type: "pull_request.opened" | "pull_request.synchronize") {
		return {
			type,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: { number: 9, head: { sha: "pr-head-sha" } },
			},
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: { tasks: [] } });
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	it("runs lintMarkdown with the PR's ref, and posts the result", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintMarkdown).mockResolvedValue({ valid: true, fileCount: 2, messages: [], fixes: [] });
		vi.mocked(postMarkdownLintCheck).mockResolvedValue({
			checkRunId: 20,
			conclusion: "success",
			htmlUrl: "https://x/20",
		});

		const res = await handleWebhookRequest(req(), ENV);

		expect(lintMarkdown).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			pullNumber: 9,
			ref: "pr-head-sha",
		});
		expect(postMarkdownLintCheck).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			pullNumber: 9,
			headSha: "pr-head-sha",
			result: { valid: true, fileCount: 2, messages: [], fixes: [] },
			runId: "test-run-id",
		});
		const body = (await res.json()) as { markdownLintCheckRun: unknown };
		expect(body.markdownLintCheckRun).toEqual({ checkRunId: 20, conclusion: "success", htmlUrl: "https://x/20" });
	});

	it("runs on pull_request.synchronize too, not just opened", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.synchronize") });
		vi.mocked(lintMarkdown).mockResolvedValue({ valid: true, fileCount: 1, messages: [], fixes: [] });
		vi.mocked(postMarkdownLintCheck).mockResolvedValue({ checkRunId: 21, conclusion: "success", htmlUrl: "" });

		await handleWebhookRequest(req(), ENV);

		expect(lintMarkdown).toHaveBeenCalled();
	});

	it("soft-skips a lintMarkdown failure -- other checks still post, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintMarkdown).mockRejectedValue(new Error("Cannot find module (some unrelated failure)"));

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(postMarkdownLintCheck).not.toHaveBeenCalled();
		expect(syncPropertiesFromConfig).toHaveBeenCalled();
		expect(postCheckRun).toHaveBeenCalled();
		const body = (await res.json()) as { markdownLintCheckRun: unknown; checkRun: unknown };
		expect(body.markdownLintCheckRun).toBeUndefined();
		expect(body.checkRun).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});
});

describe("handler — static analysis pipeline (holocron#769/#849)", () => {
	function prEvent(type: "pull_request.opened" | "pull_request.synchronize") {
		return {
			type,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: { number: 9, head: { sha: "pr-head-sha" } },
			},
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: { tasks: [] } });
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({
			properties: { holocron_capabilities: [], runtime_environment: "node" },
		});
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	it("runs lintStaticAnalysis with the PR's ref, and posts the result", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintStaticAnalysis).mockResolvedValue({ valid: true, fileCount: 2, messages: [] });
		vi.mocked(postStaticAnalysisCheck).mockResolvedValue({
			checkRunId: 30,
			conclusion: "success",
			htmlUrl: "https://x/30",
		});

		const res = await handleWebhookRequest(req(), ENV);

		expect(lintStaticAnalysis).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			pullNumber: 9,
			ref: "pr-head-sha",
		});
		expect(postStaticAnalysisCheck).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			pullNumber: 9,
			headSha: "pr-head-sha",
			result: { valid: true, fileCount: 2, messages: [] },
			runId: "test-run-id",
		});
		const body = (await res.json()) as { staticAnalysisCheckRun: unknown };
		expect(body.staticAnalysisCheckRun).toEqual({ checkRunId: 30, conclusion: "success", htmlUrl: "https://x/30" });
	});

	it("runs on pull_request.synchronize too, not just opened", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.synchronize") });
		vi.mocked(lintStaticAnalysis).mockResolvedValue({ valid: true, fileCount: 1, messages: [] });
		vi.mocked(postStaticAnalysisCheck).mockResolvedValue({ checkRunId: 31, conclusion: "success", htmlUrl: "" });

		await handleWebhookRequest(req(), ENV);

		expect(lintStaticAnalysis).toHaveBeenCalled();
	});

	it("soft-skips a lintStaticAnalysis failure -- other checks still post, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintStaticAnalysis).mockRejectedValue(new Error("Cannot find module (some unrelated failure)"));

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(postStaticAnalysisCheck).not.toHaveBeenCalled();
		expect(syncPropertiesFromConfig).toHaveBeenCalled();
		expect(postCheckRun).toHaveBeenCalled();
		const body = (await res.json()) as { staticAnalysisCheckRun: unknown; checkRun: unknown };
		expect(body.staticAnalysisCheckRun).toBeUndefined();
		expect(body.checkRun).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	describe("runtime_environment gate (unlike every other Bucket 1 check, this one isn't config-free)", () => {
		it('skips entirely when runtime_environment is explicitly "none" -- a docs-only repo has no JS/TS to lint', async () => {
			vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
			vi.mocked(syncPropertiesFromConfig).mockResolvedValue({
				properties: { holocron_capabilities: [], runtime_environment: "none" },
			});

			const res = await handleWebhookRequest(req(), ENV);

			expect(lintStaticAnalysis).not.toHaveBeenCalled();
			expect(postStaticAnalysisCheck).not.toHaveBeenCalled();
			const body = (await res.json()) as { staticAnalysisCheckRun: unknown };
			expect(body.staticAnalysisCheckRun).toBeUndefined();
			// Every other check still ran -- this gate is scoped to this one check alone.
			expect(postCheckRun).toHaveBeenCalled();
			expect(res.status).toBe(200);
		});

		it("still runs when runtime_environment is absent entirely -- permissive default, not opt-in", async () => {
			vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
			vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
			vi.mocked(lintStaticAnalysis).mockResolvedValue({ valid: true, fileCount: 0, messages: [] });
			vi.mocked(postStaticAnalysisCheck).mockResolvedValue({
				checkRunId: 32,
				conclusion: "success",
				htmlUrl: "",
			});

			await handleWebhookRequest(req(), ENV);

			expect(lintStaticAnalysis).toHaveBeenCalled();
		});

		it('still runs for a real, non-"none" runtime_environment value ("browser")', async () => {
			vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
			vi.mocked(syncPropertiesFromConfig).mockResolvedValue({
				properties: { holocron_capabilities: [], runtime_environment: "browser" },
			});
			vi.mocked(lintStaticAnalysis).mockResolvedValue({ valid: true, fileCount: 0, messages: [] });
			vi.mocked(postStaticAnalysisCheck).mockResolvedValue({
				checkRunId: 33,
				conclusion: "success",
				htmlUrl: "",
			});

			await handleWebhookRequest(req(), ENV);

			expect(lintStaticAnalysis).toHaveBeenCalled();
		});
	});

	describe("eslint.browserPackages passthrough (holocron#858)", () => {
		it("passes holocron.config.ts's eslint.browserPackages through to lintStaticAnalysis", async () => {
			vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
			vi.mocked(validateConfig).mockResolvedValue({
				status: "valid",
				filepath: "x",
				config: { tasks: [], eslint: { browserPackages: ["packages/github-client/src/app-auth"] } } as never,
			});
			vi.mocked(lintStaticAnalysis).mockResolvedValue({ valid: true, fileCount: 0, messages: [] });
			vi.mocked(postStaticAnalysisCheck).mockResolvedValue({
				checkRunId: 34,
				conclusion: "success",
				htmlUrl: "",
			});

			await handleWebhookRequest(req(), ENV);

			expect(lintStaticAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({ browserPackages: ["packages/github-client/src/app-auth"] })
			);
		});

		it("passes undefined when holocron.config.ts declares no eslint field -- the common case", async () => {
			vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
			vi.mocked(lintStaticAnalysis).mockResolvedValue({ valid: true, fileCount: 0, messages: [] });
			vi.mocked(postStaticAnalysisCheck).mockResolvedValue({
				checkRunId: 35,
				conclusion: "success",
				htmlUrl: "",
			});

			await handleWebhookRequest(req(), ENV);

			expect(lintStaticAnalysis).toHaveBeenCalledWith(expect.objectContaining({ browserPackages: undefined }));
		});

		it("ignores a malformed eslint.browserPackages (non-array) rather than throwing", async () => {
			vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
			vi.mocked(validateConfig).mockResolvedValue({
				status: "valid",
				filepath: "x",
				config: { tasks: [], eslint: { browserPackages: "not-an-array" } } as never,
			});
			vi.mocked(lintStaticAnalysis).mockResolvedValue({ valid: true, fileCount: 0, messages: [] });
			vi.mocked(postStaticAnalysisCheck).mockResolvedValue({
				checkRunId: 36,
				conclusion: "success",
				htmlUrl: "",
			});

			const res = await handleWebhookRequest(req(), ENV);

			expect(res.status).toBe(200);
			expect(lintStaticAnalysis).toHaveBeenCalledWith(expect.objectContaining({ browserPackages: undefined }));
		});

		it("filters out non-string entries from a malformed eslint.browserPackages array", async () => {
			vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
			vi.mocked(validateConfig).mockResolvedValue({
				status: "valid",
				filepath: "x",
				config: { tasks: [], eslint: { browserPackages: ["src/app-auth", 42, null] } } as never,
			});
			vi.mocked(lintStaticAnalysis).mockResolvedValue({ valid: true, fileCount: 0, messages: [] });
			vi.mocked(postStaticAnalysisCheck).mockResolvedValue({
				checkRunId: 37,
				conclusion: "success",
				htmlUrl: "",
			});

			await handleWebhookRequest(req(), ENV);

			expect(lintStaticAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({ browserPackages: ["src/app-auth"] })
			);
		});
	});
});

describe("handler — actionlint pipeline (holocron#904)", () => {
	function prEvent(type: "pull_request.opened" | "pull_request.synchronize") {
		return {
			type,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: { number: 9, head: { sha: "pr-head-sha" } },
			},
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: { tasks: [] } });
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({
			properties: { holocron_capabilities: [], runtime_environment: "node" },
		});
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	it("runs lintActionlint with the PR's ref, and posts the result", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintActionlint).mockResolvedValue({ valid: true, fileCount: 1, messages: [] });
		vi.mocked(postActionlintCheck).mockResolvedValue({
			checkRunId: 40,
			conclusion: "success",
			htmlUrl: "https://x/40",
		});

		const res = await handleWebhookRequest(req(), ENV);

		expect(lintActionlint).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			pullNumber: 9,
			ref: "pr-head-sha",
		});
		expect(postActionlintCheck).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			pullNumber: 9,
			headSha: "pr-head-sha",
			result: { valid: true, fileCount: 1, messages: [] },
			runId: "test-run-id",
		});
		const body = (await res.json()) as { actionlintCheckRun: unknown };
		expect(body.actionlintCheckRun).toEqual({ checkRunId: 40, conclusion: "success", htmlUrl: "https://x/40" });
	});

	it('still runs when runtime_environment is "none" -- config-free, unlike the eslint half of the task', async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.synchronize") });
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({
			properties: { holocron_capabilities: [], runtime_environment: "none" },
		});
		vi.mocked(lintActionlint).mockResolvedValue({ valid: true, fileCount: 0, messages: [] });
		vi.mocked(postActionlintCheck).mockResolvedValue({ checkRunId: 41, conclusion: "success", htmlUrl: "" });

		await handleWebhookRequest(req(), ENV);

		expect(lintStaticAnalysis).not.toHaveBeenCalled();
		expect(lintActionlint).toHaveBeenCalled();
	});

	it("doesn't run on push.default-branch -- no PR files to lint", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: {
				type: "push.default-branch",
				repo: "acme/demo",
				installationId: 42,
				raw: { repository: { default_branch: "main" }, after: "push-sha" },
			},
		});

		await handleWebhookRequest(req(), ENV);

		expect(lintActionlint).not.toHaveBeenCalled();
	});

	it("soft-skips a lintActionlint failure -- other checks still post, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(lintActionlint).mockRejectedValue(new Error("shellcheck exited 3: bad args"));

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(postActionlintCheck).not.toHaveBeenCalled();
		expect(postCheckRun).toHaveBeenCalled();
		const body = (await res.json()) as { actionlintCheckRun: unknown };
		expect(body.actionlintCheckRun).toBeUndefined();
	});
});

describe("handler — repo validation pipeline (holocron#913, #925)", () => {
	function prEvent() {
		return {
			type: "pull_request.opened" as const,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: {
					number: 9,
					title: "feat: add a thing",
					body: "[skip docs] why",
					head: { sha: "pr-head-sha" },
				},
			},
		};
	}

	function editedEvent(body: string | null = "edited") {
		const event = prEvent();
		return {
			...event,
			type: "pull_request.edited" as const,
			raw: { ...event.raw, pull_request: { ...event.raw.pull_request, body } },
		};
	}

	function withTasks(tasks: Array<string | { name: string }>) {
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: { tasks } as never });
	}

	const ADRS_RESULT = { valid: true, fileCount: 1, messages: [] };
	const DOCS_RESULT = {
		newPackages: [{ name: "widget", entry: "packages/widget/src/index.ts" }],
		hasDocsChange: true,
		isFeat: true,
		featWarnings: [{ dir: "utils/array-utils", path: "utils/array-utils/src/a.ts" }],
		skipped: [],
		missingReason: false,
		valid: true,
	};

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({
			properties: { holocron_capabilities: [], runtime_environment: "node" },
		});
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
		vi.mocked(validateAdrs).mockResolvedValue(ADRS_RESULT);
		vi.mocked(postAdrsCheck).mockResolvedValue({ checkRunId: 50, conclusion: "success", htmlUrl: "https://x/50" });
		vi.mocked(validateDocsPresence).mockResolvedValue(DOCS_RESULT);
		vi.mocked(postDocsPresenceCheck).mockResolvedValue({
			checkRunId: 51,
			conclusion: "success",
			htmlUrl: "https://x/51",
		});
	});

	it("runs both checks against the PR's ref when the config declares platform.repoValidation", async () => {
		withTasks(["lint", { name: "platform.repoValidation" }]);
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });

		const res = await handleWebhookRequest(req(), ENV);

		const lintInput = { client: FAKE_CLIENT, repo: "acme/demo", pullNumber: 9, ref: "pr-head-sha" };
		expect(validateAdrs).toHaveBeenCalledWith(lintInput);
		expect(validateDocsPresence).toHaveBeenCalledWith({
			...lintInput,
			prTitle: "feat: add a thing",
			prBody: "[skip docs] why",
		});
		expect(postAdrsCheck).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			pullNumber: 9,
			headSha: "pr-head-sha",
			result: ADRS_RESULT,
			runId: "test-run-id",
		});
		expect(postDocsPresenceCheck).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			headSha: "pr-head-sha",
			result: DOCS_RESULT,
			runId: "test-run-id",
		});
		const body = (await res.json()) as {
			adrsCheckRun: unknown;
			docsPresenceCheckRun: unknown;
		};
		expect(body.adrsCheckRun).toEqual({ checkRunId: 50, conclusion: "success", htmlUrl: "https://x/50" });
		expect(body.docsPresenceCheckRun).toEqual({ checkRunId: 51, conclusion: "success", htmlUrl: "https://x/51" });
	});

	it("skips both when the config doesn't declare platform.repoValidation", async () => {
		withTasks(["lint"]);
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });

		const res = await handleWebhookRequest(req(), ENV);

		expect(validateAdrs).not.toHaveBeenCalled();
		expect(validateDocsPresence).not.toHaveBeenCalled();
		expect(postCheckRun).toHaveBeenCalled();
		expect(res.status).toBe(200);
	});

	it("skips both on push.default-branch -- no PR files to validate", async () => {
		withTasks(["platform.repoValidation"]);
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: {
				type: "push.default-branch",
				repo: "acme/demo",
				installationId: 42,
				raw: { repository: { default_branch: "main" }, after: "push-sha" },
			},
		});

		await handleWebhookRequest(req(), ENV);

		expect(validateAdrs).not.toHaveBeenCalled();
		expect(validateDocsPresence).not.toHaveBeenCalled();
	});

	it("passes empty strings when the payload carries no title or description", async () => {
		withTasks(["platform.repoValidation"]);
		const event = prEvent();
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: {
				...event,
				raw: { ...event.raw, pull_request: { number: 9, body: null, head: { sha: "pr-head-sha" } } },
			},
		});

		await handleWebhookRequest(req(), ENV);

		expect(validateDocsPresence).toHaveBeenCalledWith(expect.objectContaining({ prTitle: "", prBody: "" }));
	});

	it("re-runs only docs presence when the title or description is edited", async () => {
		withTasks(["platform.repoValidation"]);
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: editedEvent() });

		const res = await handleWebhookRequest(req(), ENV);

		expect(validateDocsPresence).toHaveBeenCalledWith(
			expect.objectContaining({ pullNumber: 9, prTitle: "feat: add a thing", prBody: "edited" })
		);
		expect(postDocsPresenceCheck).toHaveBeenCalled();
		expect(validateAdrs).not.toHaveBeenCalled();
		expect(postCheckRun).not.toHaveBeenCalled();
		expect(await res.json()).toEqual({
			handled: true,
			type: "pull_request.edited",
			docsPresenceCheckRun: { checkRunId: 51, conclusion: "success", htmlUrl: "https://x/51" },
		});
	});

	it("does nothing on an edit when the config doesn't declare platform.repoValidation or isn't valid", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: editedEvent() });

		withTasks(["lint"]);
		await handleWebhookRequest(req(), ENV);
		vi.mocked(validateConfig).mockResolvedValue({ status: "missing" } as never);
		const res = await handleWebhookRequest(req(), ENV);

		expect(validateDocsPresence).not.toHaveBeenCalled();
		expect(((await res.json()) as { docsPresenceCheckRun?: unknown }).docsPresenceCheckRun).toBeUndefined();
	});

	it("does nothing on an edit when the valid config declares no tasks at all", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: editedEvent() });
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: {} as never });

		await handleWebhookRequest(req(), ENV);

		expect(validateDocsPresence).not.toHaveBeenCalled();
	});

	it("does nothing on an edit of a payload without a PR number", async () => {
		withTasks(["platform.repoValidation"]);
		const event = editedEvent();
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: { ...event, raw: { repository: { default_branch: "main" }, pull_request: { head: { sha: "s" } } } },
		});

		await handleWebhookRequest(req(), ENV);

		expect(validateDocsPresence).not.toHaveBeenCalled();
	});

	it("soft-skips each check independently -- an ADR failure doesn't stop docs presence, and vice versa", async () => {
		withTasks(["platform.repoValidation"]);
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateAdrs).mockRejectedValue(new Error("contents API down"));

		let res = await handleWebhookRequest(req(), ENV);
		let body = (await res.json()) as { adrsCheckRun: unknown; docsPresenceCheckRun: unknown };
		expect(res.status).toBe(200);
		expect(body.adrsCheckRun).toBeUndefined();
		expect(body.docsPresenceCheckRun).toEqual({ checkRunId: 51, conclusion: "success", htmlUrl: "https://x/51" });

		vi.mocked(validateAdrs).mockResolvedValue(ADRS_RESULT);
		vi.mocked(validateDocsPresence).mockRejectedValue(new Error("rate limited"));

		res = await handleWebhookRequest(req(), ENV);
		body = (await res.json()) as { adrsCheckRun: unknown; docsPresenceCheckRun: unknown };
		expect(body.adrsCheckRun).toEqual({ checkRunId: 50, conclusion: "success", htmlUrl: "https://x/50" });
		expect(body.docsPresenceCheckRun).toBeUndefined();
	});
});

describe("handler — PR Config Validation pipeline (holocron#827)", () => {
	function prEvent(type: "pull_request.opened" | "pull_request.synchronize") {
		return {
			type,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: { number: 9, head: { sha: "pr-head-sha" } },
			},
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	it("validates the PR's own branch, not the default branch, and posts the result", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(validateConfig).mockResolvedValue({
			status: "valid",
			filepath: "holocron.config.ts",
			config: { tasks: [] },
		});
		vi.mocked(postPrConfigValidationCheck).mockResolvedValue({ checkRunId: 5, conclusion: "success", htmlUrl: "" });

		const res = await handleWebhookRequest(req(), ENV);

		expect(validateConfig).toHaveBeenNthCalledWith(1, {
			client: FAKE_CLIENT,
			repo: "acme/demo",
			ref: "pr-head-sha",
		});
		expect(postPrConfigValidationCheck).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			headSha: "pr-head-sha",
			result: { status: "valid", filepath: "holocron.config.ts", config: { tasks: [] } },
			runId: "test-run-id",
		});
		const body = (await res.json()) as { prConfigValidationCheckRun: unknown };
		expect(body.prConfigValidationCheckRun).toEqual({ checkRunId: 5, conclusion: "success", htmlUrl: "" });
	});

	it("runs on pull_request.synchronize too, not just opened", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.synchronize") });
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: { tasks: [] } });
		vi.mocked(postPrConfigValidationCheck).mockResolvedValue({ checkRunId: 6, conclusion: "success", htmlUrl: "" });

		await handleWebhookRequest(req(), ENV);

		expect(postPrConfigValidationCheck).toHaveBeenCalled();
	});

	it("does not run for a push event -- there's no PR branch to validate separately from the default branch", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: {
				type: "push.default-branch" as const,
				repo: "acme/demo",
				installationId: 42,
				raw: { repository: { default_branch: "main" }, after: "sha-after" },
			},
		});
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: { tasks: [] } });

		await handleWebhookRequest(req(), ENV);

		expect(postPrConfigValidationCheck).not.toHaveBeenCalled();
	});

	it("soft-skips a failed PR-branch validateConfig call -- capability compliance still posts, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent("pull_request.opened") });
		vi.mocked(validateConfig).mockImplementation(async (input) => {
			if (input.ref === "pr-head-sha") throw new Error("PR branch fetch failed");
			return { status: "valid", filepath: "x", config: { tasks: [] } };
		});

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(postPrConfigValidationCheck).not.toHaveBeenCalled();
		expect(postCheckRun).toHaveBeenCalled();
		const body = (await res.json()) as { prConfigValidationCheckRun: unknown; checkRun: unknown };
		expect(body.prConfigValidationCheckRun).toBeUndefined();
		expect(body.checkRun).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});
});

describe("handler — Bucket 2 dispatch pipeline (holocron#769/#794)", () => {
	function pushEvent() {
		return {
			type: "push.default-branch" as const,
			repo: "acme/demo",
			installationId: 42,
			raw: { repository: { default_branch: "main" }, after: "sha-after" },
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	it("dispatches when the repo's config declares verification.typeSafety", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: pushEvent() });
		vi.mocked(validateConfig).mockResolvedValue({
			status: "valid",
			filepath: "x",
			config: { tasks: ["lint", "verification.typeSafety"] },
		});
		vi.mocked(dispatchCheck).mockResolvedValue({ checkRunId: 99, htmlUrl: "https://x/99" });

		const res = await handleWebhookRequest(req(), ENV);

		expect(dispatchCheck).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			headSha: "sha-after",
			ref: "sha-after",
			task: "verification.typeSafety",
			checkName: "sentinel:typecheck / Run tsc --noEmit",
		});
		const body = (await res.json()) as { dispatchedCheckRun: unknown };
		expect(body.dispatchedCheckRun).toEqual({ checkRunId: 99, htmlUrl: "https://x/99" });
	});

	it("also matches the task when declared as an object entry, not just a bare string", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: pushEvent() });
		vi.mocked(validateConfig).mockResolvedValue({
			status: "valid",
			filepath: "x",
			config: { tasks: [{ name: "verification.typeSafety", required: true }] },
		});
		vi.mocked(dispatchCheck).mockResolvedValue({ checkRunId: 1, htmlUrl: "" });

		await handleWebhookRequest(req(), ENV);

		expect(dispatchCheck).toHaveBeenCalled();
	});

	it("does not dispatch when the config has no tasks array at all", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: pushEvent() });
		vi.mocked(validateConfig).mockResolvedValue({ status: "valid", filepath: "x", config: {} });

		const res = await handleWebhookRequest(req(), ENV);

		expect(dispatchCheck).not.toHaveBeenCalled();
		const body = (await res.json()) as { dispatchedCheckRun: unknown };
		expect(body.dispatchedCheckRun).toBeUndefined();
	});

	it("does not dispatch when the repo's config doesn't declare the task", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: pushEvent() });
		vi.mocked(validateConfig).mockResolvedValue({
			status: "valid",
			filepath: "x",
			config: { tasks: ["lint", "verification.unitTests"] },
		});

		const res = await handleWebhookRequest(req(), ENV);

		expect(dispatchCheck).not.toHaveBeenCalled();
		const body = (await res.json()) as { dispatchedCheckRun: unknown };
		expect(body.dispatchedCheckRun).toBeUndefined();
	});

	it("soft-skips a dispatch failure -- capability compliance's own check run still posts, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: pushEvent() });
		vi.mocked(validateConfig).mockResolvedValue({
			status: "valid",
			filepath: "x",
			config: { tasks: ["verification.typeSafety"] },
		});
		vi.mocked(dispatchCheck).mockRejectedValue(new Error("workflow dispatch failed"));

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(postCheckRun).toHaveBeenCalled();
		const body = (await res.json()) as { dispatchedCheckRun: unknown; checkRun: unknown };
		expect(body.dispatchedCheckRun).toBeUndefined();
		expect(body.checkRun).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});
});

describe("handler — auto-fix-commit pipeline (holocron#820)", () => {
	function prEvent() {
		return {
			type: "pull_request.opened" as const,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: { number: 9, head: { sha: "pr-head-sha", ref: "feature-branch" } },
			},
		};
	}

	const invalidLintResult = {
		valid: false,
		fileCount: 1,
		messages: [
			{
				file: "src/index.js",
				line: 1,
				reason: "reformat me",
				formatted: "const x = 1;\n",
				scopedFix: "const x = 1;\n",
			},
		],
	};

	function configWithAutoFix(autoFix: boolean) {
		return {
			status: "valid" as const,
			filepath: "x",
			config: { tasks: [{ name: "format", with: { autoFix } }] },
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
		vi.mocked(postFormattingCheck).mockResolvedValue({ checkRunId: 2, conclusion: "neutral", htmlUrl: "" });
	});

	it("commits the fix when the repo's merged (default-branch) config opted in", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);
		vi.mocked(commitFormattingFix).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 1 });

		const res = await handleWebhookRequest(req(), ENV);

		expect(commitFormattingFix).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			headSha: "pr-head-sha",
			headRef: "feature-branch",
			result: invalidLintResult,
		});
		// Exactly 2: PR Config Validation's own PR-branch read (holocron#827)
		// and capability-compliance's default-branch read -- the auto-fix
		// gate itself never makes its own extra call, it reuses the first.
		expect(validateConfig).toHaveBeenCalledTimes(2);
		const body = (await res.json()) as { formattingFixResult: unknown };
		expect(body.formattingFixResult).toEqual({ committed: true, commitSha: "new-commit", fileCount: 1 });
	});

	it("does not commit a fixer that already committed since the last commit of a person's, and says so (holocron#1950)", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);
		vi.mocked(findAutoFixLoop).mockResolvedValue({ blocked: ["formatting", "markdown-lint"] });

		await handleWebhookRequest(req(), ENV);

		expect(findAutoFixLoop).toHaveBeenCalledWith({ client: FAKE_CLIENT, repo: "acme/demo", pullNumber: 9 });
		expect(commitFormattingFix).not.toHaveBeenCalled();
		expect(postAutoFixLoopComment).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			pullNumber: 9,
			kinds: ["formatting"],
			files: ["src/index.js"],
		});
	});

	it("does not read the commits for a finding that has no fix on a line the pull request added (holocron#1950)", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintFormatting).mockResolvedValue({
			...invalidLintResult,
			messages: invalidLintResult.messages.map((m) => ({ ...m, scopedFix: null })),
		});
		vi.mocked(findAutoFixLoop).mockResolvedValue({ blocked: ["formatting"] });

		await handleWebhookRequest(req(), ENV);

		expect(findAutoFixLoop).not.toHaveBeenCalled();
		expect(postAutoFixLoopComment).not.toHaveBeenCalled();
	});

	it("still commits a fixer that is not blocked, and posts no loop comment", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);
		vi.mocked(findAutoFixLoop).mockResolvedValue({ blocked: ["markdown-lint"] });
		vi.mocked(commitFormattingFix).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 1 });

		await handleWebhookRequest(req(), ENV);

		expect(commitFormattingFix).toHaveBeenCalled();
		expect(postAutoFixLoopComment).not.toHaveBeenCalled();
	});

	it("does not read the commits when nothing needs fixing", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintFormatting).mockResolvedValue({ valid: true, fileCount: 1, messages: [] });

		await handleWebhookRequest(req(), ENV);

		expect(findAutoFixLoop).not.toHaveBeenCalled();
	});

	it("blocks nothing when reading the commits fails -- the fix still commits", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);
		vi.mocked(findAutoFixLoop).mockRejectedValue(new Error("listCommits failed"));
		vi.mocked(commitFormattingFix).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 1 });

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(commitFormattingFix).toHaveBeenCalled();
	});

	it("commits the fix when only the PR's own branch has opted in, not yet merged to main", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockImplementation(async (input) =>
			input.ref === "pr-head-sha" ? configWithAutoFix(true) : configWithAutoFix(false)
		);
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);
		vi.mocked(commitFormattingFix).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 1 });

		const res = await handleWebhookRequest(req(), ENV);

		// PR Config Validation's own block makes the ref-based call first;
		// the auto-fix gate reuses that result rather than fetching again.
		expect(validateConfig).toHaveBeenNthCalledWith(1, {
			client: FAKE_CLIENT,
			repo: "acme/demo",
			ref: "pr-head-sha",
		});
		expect(commitFormattingFix).toHaveBeenCalled();
		const body = (await res.json()) as { formattingFixResult: unknown };
		expect(body.formattingFixResult).toEqual({ committed: true, commitSha: "new-commit", fileCount: 1 });
	});

	it("does not commit when neither the default-branch nor the PR's own branch opted in", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(false));
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);

		const res = await handleWebhookRequest(req(), ENV);

		expect(commitFormattingFix).not.toHaveBeenCalled();
		const body = (await res.json()) as { formattingFixResult: unknown };
		expect(body.formattingFixResult).toBeUndefined();
	});

	it("honours the deprecated alias `sourceQuality.formatting` for the opt-out, merged and PR-branch (holocron#1697)", async () => {
		const aliased = {
			status: "valid" as const,
			filepath: "x",
			config: { tasks: [{ name: "sourceQuality.formatting", with: { autoFix: false } }] },
		};
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);

		// merged config opts out through the alias; the PR branch declares nothing
		vi.mocked(validateConfig).mockImplementation(async (input) =>
			input.ref === "pr-head-sha"
				? { status: "valid", filepath: "x", config: { tasks: [{ name: "format" }] } }
				: aliased
		);
		await handleWebhookRequest(req(), ENV);
		expect(commitFormattingFix).not.toHaveBeenCalled();

		// PR branch opts out through the alias; the merged config declares nothing
		vi.mocked(validateConfig).mockImplementation(async (input) =>
			input.ref === "pr-head-sha" ? aliased : { status: "valid", filepath: "x", config: { tasks: [] } }
		);
		await handleWebhookRequest(req(), ENV);
		expect(commitFormattingFix).not.toHaveBeenCalled();
	});

	it("commits by default when neither the merged nor the PR's own branch config declares autoFix at all (holocron#860)", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue({
			status: "valid",
			filepath: "x",
			config: { tasks: [{ name: "format" }] },
		});
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);
		vi.mocked(commitFormattingFix).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 1 });

		const res = await handleWebhookRequest(req(), ENV);

		expect(commitFormattingFix).toHaveBeenCalled();
		const body = (await res.json()) as { formattingFixResult: unknown };
		expect(body.formattingFixResult).toEqual({ committed: true, commitSha: "new-commit", fileCount: 1 });
	});

	it("the PR's own branch can opt out even when the merged config declares nothing (holocron#860)", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockImplementation(async (input) =>
			input.ref === "pr-head-sha"
				? configWithAutoFix(false)
				: { status: "valid", filepath: "x", config: { tasks: [{ name: "format" }] } }
		);
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);

		await handleWebhookRequest(req(), ENV);

		expect(commitFormattingFix).not.toHaveBeenCalled();
	});

	it("does not commit when lintFormatting reports the PR is already valid", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintFormatting).mockResolvedValue({ valid: true, fileCount: 2, messages: [] });

		await handleWebhookRequest(req(), ENV);

		expect(commitFormattingFix).not.toHaveBeenCalled();
	});

	it("soft-skips a commitFormattingFix failure -- capability compliance still posts, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);
		vi.mocked(commitFormattingFix).mockRejectedValue(new Error("git commit failed"));

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(postCheckRun).toHaveBeenCalled();
		const body = (await res.json()) as { formattingFixResult: unknown; checkRun: unknown };
		expect(body.formattingFixResult).toBeUndefined();
		expect(body.checkRun).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	it("does not commit when the PR's own branch config is valid but declares no tasks array at all", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockImplementation(async (input) =>
			input.ref === "pr-head-sha" ? { status: "valid", filepath: "x", config: {} } : configWithAutoFix(false)
		);
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);

		await handleWebhookRequest(req(), ENV);

		expect(commitFormattingFix).not.toHaveBeenCalled();
	});

	it("does not commit when the PR-branch validateConfig call resolves non-valid (e.g. no-config), rather than opted-in", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockImplementation(async (input) =>
			input.ref === "pr-head-sha" ? { status: "no-config" } : configWithAutoFix(false)
		);
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);

		await handleWebhookRequest(req(), ENV);

		expect(commitFormattingFix).not.toHaveBeenCalled();
	});

	it("soft-skips a failed PR-branch validateConfig call (e.g. malformed config on that branch) -- still doesn't commit, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockImplementation(async (input) => {
			if (input.ref === "pr-head-sha") throw new Error("PR branch config fetch failed");
			return configWithAutoFix(false);
		});
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(commitFormattingFix).not.toHaveBeenCalled();
		expect(postCheckRun).toHaveBeenCalled();
	});
});

describe("handler — editorconfig auto-fix-commit pipeline", () => {
	// autoFixOptedIn's own opt-in/opt-out resolution is one gate shared by
	// both formatting's and editorconfig's auto-fix-commit -- every edge
	// case of that resolution is already covered by the formatting pipeline
	// suite above (same code path, same `format` task
	// name). These tests only cover editorconfig's own invocation once
	// opted in, not the gate logic a second time.
	function prEvent() {
		return {
			type: "pull_request.opened" as const,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: { number: 9, head: { sha: "pr-head-sha", ref: "feature-branch" } },
			},
		};
	}

	const invalidLintResult = {
		valid: false,
		fileCount: 1,
		messages: [{ file: "src/index.ts", line: 1, reason: "Trailing whitespace." }],
		fixes: [{ file: "src/index.ts", fixed: "const x = 1;\n", scopedFix: "const x = 1;\n" }],
	};

	function configWithAutoFix(autoFix: boolean) {
		return {
			status: "valid" as const,
			filepath: "x",
			config: { tasks: [{ name: "format", with: { autoFix } }] },
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
		vi.mocked(postEditorConfigCheck).mockResolvedValue({ checkRunId: 2, conclusion: "failure", htmlUrl: "" });
	});

	it("commits the fix when opted in and lintEditorConfig reports violations", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintEditorConfig).mockResolvedValue(invalidLintResult);
		vi.mocked(commitEditorConfigFix).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 1 });

		const res = await handleWebhookRequest(req(), ENV);

		expect(commitEditorConfigFix).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			headSha: "pr-head-sha",
			headRef: "feature-branch",
			result: invalidLintResult,
		});
		const body = (await res.json()) as { editorConfigFixResult: unknown };
		expect(body.editorConfigFixResult).toEqual({ committed: true, commitSha: "new-commit", fileCount: 1 });
	});

	it("does not commit when lintEditorConfig reports the PR is already valid", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintEditorConfig).mockResolvedValue({ valid: true, fileCount: 2, messages: [], fixes: [] });

		await handleWebhookRequest(req(), ENV);

		expect(commitEditorConfigFix).not.toHaveBeenCalled();
	});

	it("does not commit when neither the default-branch nor the PR's own branch opted in", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(false));
		vi.mocked(lintEditorConfig).mockResolvedValue(invalidLintResult);

		const res = await handleWebhookRequest(req(), ENV);

		expect(commitEditorConfigFix).not.toHaveBeenCalled();
		const body = (await res.json()) as { editorConfigFixResult: unknown };
		expect(body.editorConfigFixResult).toBeUndefined();
	});

	it("soft-skips a commitEditorConfigFix failure -- capability compliance still posts, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintEditorConfig).mockResolvedValue(invalidLintResult);
		vi.mocked(commitEditorConfigFix).mockRejectedValue(new Error("git commit failed"));

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(postCheckRun).toHaveBeenCalled();
		const body = (await res.json()) as { editorConfigFixResult: unknown; checkRun: unknown };
		expect(body.editorConfigFixResult).toBeUndefined();
		expect(body.checkRun).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	it("commits both formatting's and editorconfig's fixes independently in the same request", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(postFormattingCheck).mockResolvedValue({ checkRunId: 3, conclusion: "neutral", htmlUrl: "" });
		vi.mocked(lintFormatting).mockResolvedValue({
			valid: false,
			fileCount: 1,
			messages: [
				{
					file: "src/other.ts",
					line: 1,
					reason: "reformat me",
					formatted: "const y = 2;\n",
					scopedFix: "const y = 2;\n",
				},
			],
		});
		vi.mocked(commitFormattingFix).mockResolvedValue({ committed: true, commitSha: "fmt-commit", fileCount: 1 });
		vi.mocked(lintEditorConfig).mockResolvedValue(invalidLintResult);
		vi.mocked(commitEditorConfigFix).mockResolvedValue({ committed: true, commitSha: "ec-commit", fileCount: 1 });

		const res = await handleWebhookRequest(req(), ENV);

		expect(commitFormattingFix).toHaveBeenCalled();
		expect(commitEditorConfigFix).toHaveBeenCalled();
		const body = (await res.json()) as { formattingFixResult: unknown; editorConfigFixResult: unknown };
		expect(body.formattingFixResult).toEqual({ committed: true, commitSha: "fmt-commit", fileCount: 1 });
		expect(body.editorConfigFixResult).toEqual({ committed: true, commitSha: "ec-commit", fileCount: 1 });
	});
});

describe("handler — markdownlint auto-fix-commit pipeline", () => {
	// autoFixOptedIn's own opt-in/opt-out resolution is one gate shared by
	// formatting's, editorconfig's, and markdownlint's auto-fix-commit --
	// every edge case of that resolution is already covered by the
	// formatting pipeline suite above (same code path, same
	// `format` task name). These tests only cover
	// markdownlint's own invocation once opted in, not the gate logic
	// again.
	function prEvent() {
		return {
			type: "pull_request.opened" as const,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: { number: 9, head: { sha: "pr-head-sha", ref: "feature-branch" } },
			},
		};
	}

	const invalidLintResult = {
		valid: false,
		fileCount: 1,
		messages: [
			{
				file: "README.md",
				line: 3,
				ruleNames: ["MD004"],
				reason: "Unordered list style",
				errorRange: null,
				severity: "error" as const,
			},
		],
		fixes: [
			{
				file: "README.md",
				fixed: "# Title\n\n* item one\n* item two\n",
				scopedFix: "# Title\n\n* item one\n* item two\n",
			},
		],
	};

	function configWithAutoFix(autoFix: boolean) {
		return {
			status: "valid" as const,
			filepath: "x",
			config: { tasks: [{ name: "format", with: { autoFix } }] },
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
		vi.mocked(postMarkdownLintCheck).mockResolvedValue({ checkRunId: 2, conclusion: "failure", htmlUrl: "" });
	});

	it("commits the fix when opted in and lintMarkdown reports violations", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintMarkdown).mockResolvedValue(invalidLintResult);
		vi.mocked(commitMarkdownLintFix).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 1 });

		const res = await handleWebhookRequest(req(), ENV);

		expect(commitMarkdownLintFix).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			headSha: "pr-head-sha",
			headRef: "feature-branch",
			result: invalidLintResult,
		});
		const body = (await res.json()) as { markdownLintFixResult: unknown };
		expect(body.markdownLintFixResult).toEqual({ committed: true, commitSha: "new-commit", fileCount: 1 });
	});

	it("does not commit when lintMarkdown reports the PR is already valid", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintMarkdown).mockResolvedValue({ valid: true, fileCount: 2, messages: [], fixes: [] });

		await handleWebhookRequest(req(), ENV);

		expect(commitMarkdownLintFix).not.toHaveBeenCalled();
	});

	it("does not commit when neither the default-branch nor the PR's own branch opted in", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(false));
		vi.mocked(lintMarkdown).mockResolvedValue(invalidLintResult);

		const res = await handleWebhookRequest(req(), ENV);

		expect(commitMarkdownLintFix).not.toHaveBeenCalled();
		const body = (await res.json()) as { markdownLintFixResult: unknown };
		expect(body.markdownLintFixResult).toBeUndefined();
	});

	it("soft-skips a commitMarkdownLintFix failure -- capability compliance still posts, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintMarkdown).mockResolvedValue(invalidLintResult);
		vi.mocked(commitMarkdownLintFix).mockRejectedValue(new Error("git commit failed"));

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		expect(postCheckRun).toHaveBeenCalled();
		const body = (await res.json()) as { markdownLintFixResult: unknown; checkRun: unknown };
		expect(body.markdownLintFixResult).toBeUndefined();
		expect(body.checkRun).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
	});

	it("commits formatting's, editorconfig's, and markdownlint's fixes independently in the same request", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(postFormattingCheck).mockResolvedValue({ checkRunId: 3, conclusion: "neutral", htmlUrl: "" });
		vi.mocked(lintFormatting).mockResolvedValue({
			valid: false,
			fileCount: 1,
			messages: [
				{
					file: "src/other.ts",
					line: 1,
					reason: "reformat me",
					formatted: "const y = 2;\n",
					scopedFix: "const y = 2;\n",
				},
			],
		});
		vi.mocked(commitFormattingFix).mockResolvedValue({ committed: true, commitSha: "fmt-commit", fileCount: 1 });
		vi.mocked(postEditorConfigCheck).mockResolvedValue({ checkRunId: 4, conclusion: "failure", htmlUrl: "" });
		vi.mocked(lintEditorConfig).mockResolvedValue({
			valid: false,
			fileCount: 1,
			messages: [{ file: "src/index.ts", line: 1, reason: "Trailing whitespace." }],
			fixes: [{ file: "src/index.ts", fixed: "const x = 1;\n", scopedFix: "const x = 1;\n" }],
		});
		vi.mocked(commitEditorConfigFix).mockResolvedValue({ committed: true, commitSha: "ec-commit", fileCount: 1 });
		vi.mocked(lintMarkdown).mockResolvedValue(invalidLintResult);
		vi.mocked(commitMarkdownLintFix).mockResolvedValue({ committed: true, commitSha: "md-commit", fileCount: 1 });

		const res = await handleWebhookRequest(req(), ENV);

		expect(commitFormattingFix).toHaveBeenCalled();
		expect(commitEditorConfigFix).toHaveBeenCalled();
		expect(commitMarkdownLintFix).toHaveBeenCalled();
		const body = (await res.json()) as {
			formattingFixResult: unknown;
			editorConfigFixResult: unknown;
			markdownLintFixResult: unknown;
		};
		expect(body.formattingFixResult).toEqual({ committed: true, commitSha: "fmt-commit", fileCount: 1 });
		expect(body.editorConfigFixResult).toEqual({ committed: true, commitSha: "ec-commit", fileCount: 1 });
		expect(body.markdownLintFixResult).toEqual({ committed: true, commitSha: "md-commit", fileCount: 1 });
	});
});

describe("handler — auto-fix PR comment (holocron#674/#834)", () => {
	function prEvent() {
		return {
			type: "pull_request.opened" as const,
			repo: "acme/demo",
			installationId: 42,
			raw: {
				repository: { default_branch: "main" },
				pull_request: { number: 9, head: { sha: "pr-head-sha", ref: "feature-branch" } },
			},
		};
	}

	const invalidLintResult = {
		valid: false,
		fileCount: 1,
		messages: [
			{
				file: "src/index.js",
				line: 1,
				reason: "reformat me",
				formatted: "const x = 1;\n",
				scopedFix: "const x = 1;\n",
			},
		],
	};

	function configWithAutoFix(autoFix: boolean) {
		return {
			status: "valid" as const,
			filepath: "x",
			config: { tasks: [{ name: "format", with: { autoFix } }] },
		};
	}

	beforeEach(() => {
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(syncPropertiesFromConfig).mockResolvedValue({ properties: { holocron_capabilities: [] } });
		vi.mocked(postCheckRun).mockResolvedValue({ checkRunId: 1, conclusion: "success", htmlUrl: "" });
		vi.mocked(postFormattingCheck).mockResolvedValue({ checkRunId: 2, conclusion: "neutral", htmlUrl: "" });
		vi.mocked(validateConfig).mockResolvedValue(configWithAutoFix(true));
		vi.mocked(lintFormatting).mockResolvedValue(invalidLintResult);
	});

	it("posts a comment when commitFormattingFix actually committed", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(commitFormattingFix).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 1 });
		vi.mocked(postAutoFixComment).mockResolvedValue({ posted: true });

		const res = await handleWebhookRequest(req(), ENV);

		expect(postAutoFixComment).toHaveBeenCalledWith({
			client: FAKE_CLIENT,
			repo: "acme/demo",
			pullNumber: 9,
			fixResult: { committed: true, commitSha: "new-commit", fileCount: 1 },
			lintResult: invalidLintResult,
		});
		const body = (await res.json()) as { autoFixCommentResult: unknown };
		expect(body.autoFixCommentResult).toEqual({ posted: true });
	});

	it("does not post a comment when commitFormattingFix resolves committed: false", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(commitFormattingFix).mockResolvedValue({ committed: false, fileCount: 0 });

		const res = await handleWebhookRequest(req(), ENV);

		expect(postAutoFixComment).not.toHaveBeenCalled();
		const body = (await res.json()) as { autoFixCommentResult: unknown };
		expect(body.autoFixCommentResult).toBeUndefined();
	});

	it("soft-skips a postAutoFixComment failure -- the commit itself still reports success, request still succeeds", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({ handled: true, event: prEvent() });
		vi.mocked(commitFormattingFix).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 1 });
		vi.mocked(postAutoFixComment).mockRejectedValue(new Error("comment failed"));

		const res = await handleWebhookRequest(req(), ENV);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { autoFixCommentResult: unknown; formattingFixResult: unknown };
		expect(body.autoFixCommentResult).toBeUndefined();
		expect(body.formattingFixResult).toEqual({ committed: true, commitSha: "new-commit", fileCount: 1 });
	});
});

describe("handleWebhookRequest — role sync (holocron#1595)", () => {
	const teamEvent = {
		handled: true as const,
		event: {
			type: "team.membership" as const,
			org: "acme",
			team: "gatekeepers",
			installationId: 5,
			raw: {},
		},
	};

	it("syncs the team's roles through the org's installation, with the environment's settings", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue(teamEvent);
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		const sync = { status: "synced" as const, roles: ["gatekeepers"], added: 1, removed: 0, failures: [] };
		vi.mocked(runRoleSync).mockResolvedValue(sync);
		const env = { ...ENV, SENTINEL_ROLE_SYNC_REPO: "acme/holocron" };
		const res = await handleWebhookRequest(req(), env);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ handled: true, type: "team.membership", sync });
		expect(createInstallationClient).toHaveBeenCalledWith(
			{ appId: ENV.SENTINEL_GITHUB_APP_ID, privateKey: ENV.SENTINEL_GITHUB_APP_PRIVATE_KEY },
			5
		);
		expect(runRoleSync).toHaveBeenCalledWith({ client: FAKE_CLIENT, env, org: "acme", team: "gatekeepers" });
		expect(validateConfig).not.toHaveBeenCalled();
	});

	it("syncs every team on an organization member removal", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue({
			handled: true,
			event: { type: "organization.member-removed", org: "acme", installationId: 5, raw: {} },
		});
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(runRoleSync).mockResolvedValue({ status: "skipped", reason: "role sync is off" });
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ sync: { status: "skipped" } });
		expect(vi.mocked(runRoleSync).mock.calls[0]![0].team).toBeUndefined();
	});

	it("answers 500 when the sync fails or only partly worked, so the delivery can be redelivered", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue(teamEvent);
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(runRoleSync).mockResolvedValueOnce({ status: "fail", reason: "Discord is down" });
		expect((await handleWebhookRequest(req(), ENV)).status).toBe(500);
		vi.mocked(runRoleSync).mockResolvedValueOnce({
			status: "partial",
			roles: ["gatekeepers"],
			added: 0,
			removed: 0,
			failures: ["x"],
		});
		expect((await handleWebhookRequest(req(), ENV)).status).toBe(500);
	});
});

describe("handleWebhookRequest — #prs feed (holocron#1833)", () => {
	const feedEvent = (type: "pull_request.feed" | "pull_request_review" | "check_run.completed") => ({
		handled: true as const,
		event: {
			type,
			repo: "acme/demo",
			installationId: 7,
			action: "closed",
			pullNumbers: [12],
			...(type === "check_run.completed"
				? { checkRun: { name: "ci / Required checks", headSha: "abc", conclusion: "failure", url: "u" } }
				: {}),
			raw: {},
		},
	});
	const OK = { status: "ok" as const, pulls: [{ number: 12, outcome: "updated" as const, posted: [] }] };

	it("runs only the feed for a feed-only event, with the installation client and the trigger", async () => {
		for (const [type, trigger] of [
			["pull_request.feed", { kind: "pull_request", action: "closed", numbers: [12] }],
			["pull_request_review", { kind: "review", numbers: [12] }],
			[
				"check_run.completed",
				{
					kind: "check_run",
					numbers: [12],
					check: { name: "ci / Required checks", headSha: "abc", conclusion: "failure", url: "u" },
				},
			],
		] as const) {
			vi.mocked(parseWebhookEvent).mockReturnValue(feedEvent(type));
			vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
			vi.mocked(runPrFeed).mockResolvedValue(OK);
			vi.mocked(validateConfig).mockClear();
			vi.mocked(lintCommits).mockClear();
			const res = await handleWebhookRequest(req(), ENV);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ handled: true, type, prFeed: OK });
			expect(runPrFeed).toHaveBeenLastCalledWith({ client: FAKE_CLIENT, env: ENV, repo: "acme/demo", trigger });
			expect(createInstallationClient).toHaveBeenLastCalledWith(
				{ appId: ENV.SENTINEL_GITHUB_APP_ID, privateKey: ENV.SENTINEL_GITHUB_APP_PRIVATE_KEY },
				7
			);
			expect(validateConfig).not.toHaveBeenCalled();
			expect(lintCommits).not.toHaveBeenCalled();
		}
	});

	it("answers 200 for a skipped feed", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue(feedEvent("pull_request_review"));
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(runPrFeed).mockResolvedValue({ status: "skipped", reason: "off" });
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ prFeed: { status: "skipped", reason: "off" } });
	});

	it("answers 500 with the reason when the feed fails", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue(feedEvent("check_run.completed"));
		vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
		vi.mocked(runPrFeed).mockResolvedValue({ status: "fail", reason: "Missing Access" });
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({
			handled: true,
			type: "check_run.completed",
			prFeed: { status: "fail", reason: "Missing Access" },
		});
	});

	it("answers 500 rather than throwing when the installation token cannot be had", async () => {
		vi.mocked(parseWebhookEvent).mockReturnValue(feedEvent("pull_request.feed"));
		vi.mocked(createInstallationClient).mockRejectedValue(new Error("bad credentials"));
		const res = await handleWebhookRequest(req(), ENV);
		expect(res.status).toBe(500);
		expect(await res.json()).toMatchObject({ prFeed: { status: "fail", reason: "bad credentials" } });
		expect(runPrFeed).not.toHaveBeenCalled();
		vi.mocked(createInstallationClient).mockRejectedValue("nope");
		expect(await (await handleWebhookRequest(req(), ENV)).json()).toMatchObject({
			prFeed: { status: "fail", reason: "nope" },
		});
	});

	describe("on an event the checks also handle", () => {
		const opened = {
			handled: true as const,
			event: {
				type: "pull_request.opened" as const,
				repo: "acme/demo",
				installationId: 42,
				action: "opened",
				pullNumbers: [12],
				raw: { repository: { default_branch: "main" }, pull_request: { number: 12, head: { sha: "sha1" } } },
			},
		};

		it("adds the feed's result to the checks' response and leaves the rest as it was", async () => {
			vi.mocked(parseWebhookEvent).mockReturnValue(opened);
			vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
			vi.mocked(validateConfig).mockResolvedValue({ status: "no-config" });
			vi.mocked(runPrFeed).mockResolvedValue(OK);
			const res = await handleWebhookRequest(req(), ENV);
			expect(res.status).toBe(200);
			expect(await res.json()).toMatchObject({
				handled: true,
				type: "pull_request.opened",
				config: "no-config",
				prFeed: OK,
			});
			expect(runPrFeed).toHaveBeenCalledWith({
				client: FAKE_CLIENT,
				env: ENV,
				repo: "acme/demo",
				trigger: { kind: "pull_request", action: "opened", numbers: [12] },
			});
			expect(lintCommits).toHaveBeenCalled();
		});

		it("still runs the checks when the feed fails, then answers 500 with both", async () => {
			vi.mocked(parseWebhookEvent).mockReturnValue(opened);
			vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
			vi.mocked(validateConfig).mockResolvedValue({ status: "no-config" });
			vi.mocked(runPrFeed).mockResolvedValue({ status: "fail", reason: "Missing Access" });
			const res = await handleWebhookRequest(req(), ENV);
			expect(res.status).toBe(500);
			expect(await res.json()).toMatchObject({
				config: "no-config",
				prFeed: { status: "fail", reason: "Missing Access" },
			});
			expect(lintCommits).toHaveBeenCalled();
		});

		it("keeps the checks' status when the feed is skipped", async () => {
			vi.mocked(parseWebhookEvent).mockReturnValue({
				handled: true,
				event: { ...opened.event, raw: {} },
			});
			vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
			vi.mocked(runPrFeed).mockResolvedValue({ status: "skipped", reason: "off" });
			const res = await handleWebhookRequest(req(), ENV);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				handled: false,
				reason: expect.stringContaining("payload missing"),
				prFeed: { status: "skipped", reason: "off" },
			});
		});

		it("does not run the feed for an event that names no pull request", async () => {
			vi.mocked(parseWebhookEvent).mockReturnValue({
				handled: true,
				event: { ...opened.event, pullNumbers: undefined },
			});
			vi.mocked(createInstallationClient).mockResolvedValue(FAKE_CLIENT as never);
			vi.mocked(validateConfig).mockResolvedValue({ status: "no-config" });
			await handleWebhookRequest(req(), ENV);
			expect(runPrFeed).not.toHaveBeenCalled();
		});
	});
});
