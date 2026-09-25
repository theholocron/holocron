import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeFlush } = vi.hoisted(() => ({ fakeFlush: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@theholocron/observability/logger", () => ({
	createLogger: () => ({
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: fakeFlush },
		runId: "test-run-id",
	}),
}));
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

import { createInstallationClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

import { postCheckRun } from "./actions/capability-compliance/post-check-run.js";
import { syncPropertiesFromConfig } from "./actions/capability-compliance/sync-properties.js";
import { lintCommits } from "./actions/commit-standards/lint-commits.js";
import { postCommitStandardsCheck } from "./actions/commit-standards/post-commit-standards-check.js";
import { dispatchCheck } from "./actions/dispatched-check/dispatch-check.js";
import { type Env, handleWebhookRequest } from "./handler.js";
import { validateConfig } from "./utils/validate-config.js";
import { parseWebhookEvent, WebhookVerificationError } from "./utils/webhook.js";

const ENV: Env = {
	GITHUB_APP_ID: "123456",
	// createInstallationClient is mocked below — this never gets parsed as a
	// real PEM, so a plain placeholder avoids gitleaks flagging the literal
	// dash-wrapped PEM delimiter pattern in test fixtures.
	GITHUB_APP_PRIVATE_KEY: "fake-private-key-for-tests",
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
	vi.mocked(dispatchCheck).mockReset();
	fakeFlush.mockClear();
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
			{ appId: ENV.GITHUB_APP_ID, privateKey: ENV.GITHUB_APP_PRIVATE_KEY },
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
			checkName: "Verification / Type Safety / Run tsc --noEmit",
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
