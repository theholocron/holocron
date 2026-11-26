import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { handleScheduledRequest } from "./handle-scheduled-request.js";

const { privateKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	privateKeyEncoding: { type: "pkcs1", format: "pem" },
});
const ENV = {
	CRON_SECRET: "s3cret",
	SENTINEL_SCHEDULE_REPO: "o/r",
	SENTINEL_GITHUB_APP_ID: "1",
	SENTINEL_GITHUB_APP_PRIVATE_KEY: privateKey,
};
const call = (query = "?task=sync-incidents", init: RequestInit & { auth?: string | null } = {}) => {
	const { auth = "Bearer s3cret", ...rest } = init;
	return new Request(`https://sentinel.test/api/scheduled${query}`, {
		method: "GET",
		headers: auth === null ? {} : { authorization: auth },
		...rest,
	});
};

function options(over: { installation?: number | undefined; dispatch?: () => Promise<void> } = {}) {
	const createWorkflowDispatch = vi.fn(over.dispatch ?? (async () => undefined));
	const client = {
		repos: { getRepo: async () => ({ default_branch: "alpha" }) },
		workflows: { createWorkflowDispatch },
	};
	const findInstallation = vi.fn(async () => ("installation" in over ? over.installation : 42));
	const makeClient = vi.fn(async () => client as never);
	return { findInstallation, makeClient, createWorkflowDispatch };
}

describe("handleScheduledRequest", () => {
	it("dispatches the task's workflow and answers 200", async () => {
		const o = options();
		const response = await handleScheduledRequest(call(), ENV, o);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			handled: true,
			task: "sync-incidents",
			workflow: "ci.sync-incidents.yml",
			ref: "alpha",
		});
		expect(o.findInstallation).toHaveBeenCalledWith("o/r");
		expect(o.makeClient).toHaveBeenCalledWith(42);
		expect(o.createWorkflowDispatch).toHaveBeenCalledWith("o/r", "ci.sync-incidents.yml", "alpha");
	});

	it("fails closed: 503 with no CRON_SECRET, 401 for a wrong or missing secret, and nothing is looked up", async () => {
		const o = options();
		expect((await handleScheduledRequest(call(), { ...ENV, CRON_SECRET: undefined }, o)).status).toBe(503);
		expect((await handleScheduledRequest(call(undefined, { auth: "Bearer nope" }), ENV, o)).status).toBe(401);
		expect((await handleScheduledRequest(call(undefined, { auth: null }), ENV, o)).status).toBe(401);
		expect(o.findInstallation).not.toHaveBeenCalled();
	});

	it("answers 405 for anything but GET, 404 with no repository set, 400 with no task and 404 for an unknown one", async () => {
		const o = options();
		expect((await handleScheduledRequest(call(undefined, { method: "POST" }), ENV, o)).status).toBe(405);
		expect((await handleScheduledRequest(call(), { ...ENV, SENTINEL_SCHEDULE_REPO: undefined }, o)).status).toBe(
			404
		);
		expect((await handleScheduledRequest(call(""), ENV, o)).status).toBe(400);
		const unknown = await handleScheduledRequest(call("?task=nope"), ENV, o);
		expect(unknown.status).toBe(404);
		expect(o.createWorkflowDispatch).not.toHaveBeenCalled();
	});

	it("answers 502 when the App is not installed on the repository, or GitHub refuses the dispatch", async () => {
		const missing = options({ installation: undefined });
		const none = await handleScheduledRequest(call(), ENV, missing);
		expect(none.status).toBe(502);
		expect(((await none.json()) as { reason: string }).reason).toMatch(/not installed on o\/r/);
		expect(missing.makeClient).not.toHaveBeenCalled();

		const refused = options({
			dispatch: async () => {
				throw new Error("Resource not accessible by integration");
			},
		});
		const failed = await handleScheduledRequest(call(), ENV, refused);
		expect(failed.status).toBe(502);
		expect(((await failed.json()) as { reason: string }).reason).toMatch(/not accessible/);
	});

	it("answers 500 for an unexpected error, such as a missing App key", async () => {
		const o = options();
		const response = await handleScheduledRequest(
			call(),
			{ ...ENV, SENTINEL_GITHUB_APP_PRIVATE_KEY: undefined },
			o
		);
		expect(response.status).toBe(500);
		expect(o.findInstallation).not.toHaveBeenCalled();
	});

	it("finds the installation and makes the client through GitHub when no seam is given", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = String(input);
			if (url.endsWith("/repos/o/r/installation")) return Response.json({ id: 7 });
			if (url.endsWith("/app/installations/7/access_tokens")) {
				return Response.json({ token: "t", expires_at: "2026-11-25T00:00:00Z" });
			}
			if (url.endsWith("/repos/o/r")) return Response.json({ default_branch: "alpha" });
			if (url.includes("/dispatches")) return new Response(null, { status: 204 });
			return new Response("unexpected", { status: 500 });
		});
		try {
			const response = await handleScheduledRequest(call(), ENV);
			expect(response.status).toBe(200);
			expect(fetchSpy.mock.calls.map(([u]) => String(u))).toContain(
				"https://api.github.com/repos/o/r/actions/workflows/ci.sync-incidents.yml/dispatches"
			);
		} finally {
			fetchSpy.mockRestore();
		}
	});
});
