import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@theholocron/github-client", () => ({ createInstallationClient: vi.fn() }));
vi.mock("./actions/post-check-run.js", () => ({ postCheckRun: vi.fn() }));
vi.mock("./actions/sync-properties.js", () => ({ syncPropertiesFromConfig: vi.fn() }));
vi.mock("./utils/validate-config.js", () => ({ validateConfig: vi.fn() }));
vi.mock("./utils/webhook.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./utils/webhook.js")>();
	return { ...actual, parseWebhookEvent: vi.fn() };
});

import { createInstallationClient } from "@theholocron/github-client";

import { postCheckRun } from "./actions/post-check-run.js";
import { syncPropertiesFromConfig } from "./actions/sync-properties.js";
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
		});
		expect(await res.json()).toEqual({
			handled: true,
			type: "push.default-branch",
			checkRun: { checkRunId: 7, conclusion: "success", htmlUrl: "https://x" },
		});
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
