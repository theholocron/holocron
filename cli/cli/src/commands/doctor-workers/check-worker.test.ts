import { describe, expect, it } from "vitest";

import type { Workers } from "../../plugin/index.js";
import { checkWorker } from "./check-worker.js";
import type { DeclaredWorker } from "./doctor-workers.type.js";

const worker: DeclaredWorker = {
	label: "relay",
	script: "comlink",
	host: "comlink.example.dev",
	bindings: ["COMLINK_SENTRY_WEBHOOK", "COMLINK_SENTRY_SECRET"],
};

const provider = (over: Partial<Workers> = {}): Workers =>
	({
		key: "workers",
		providerName: "cloudflare",
		inspectScript: async () => ({
			exists: true,
			routes: ["comlink.example.dev/*"],
			bindingNames: ["COMLINK_SENTRY_WEBHOOK", "COMLINK_SENTRY_SECRET"],
		}),
		latestDeployment: async () => ({ id: "d", createdAt: "2026-02-01T00:00:00Z", active: true }),
		...over,
	}) as Workers;

const ids = (rows: Awaited<ReturnType<typeof checkWorker>>) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe("checkWorker", () => {
	it("passes a Worker that is routed, bound and deployed", async () => {
		const rows = await checkWorker(provider(), worker);
		expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
		expect(ids(rows)["workers:relay:deployment"]!.detail).toBe("deployed 2026-02-01T00:00:00Z");
	});

	it("matches the route and the binding names without regard to case", async () => {
		const rows = await checkWorker(
			provider({
				inspectScript: async () => ({
					exists: true,
					routes: ["COMLINK.example.dev/*"],
					bindingNames: ["comlink_sentry_webhook", "comlink_sentry_secret"],
				}),
			}),
			worker
		);
		expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
	});

	it("fails a script that is not deployed, and skips what needs it", async () => {
		const rows = ids(
			await checkWorker(
				provider({ inspectScript: async () => ({ exists: false, routes: [], bindingNames: [] }) }),
				worker
			)
		);
		expect(rows["workers:relay:deployed"]).toMatchObject({ status: "fail" });
		expect(rows["workers:relay:bindings"]).toMatchObject({ status: "skip" });
		expect(rows["workers:relay:deployment"]).toMatchObject({ status: "skip" });
	});

	it("fails a missing route and names the missing bindings, never a value", async () => {
		const rows = ids(
			await checkWorker(
				provider({
					inspectScript: async () => ({
						exists: true,
						routes: ["other.dev/*"],
						bindingNames: ["COMLINK_SENTRY_WEBHOOK"],
					}),
				}),
				worker
			)
		);
		expect(rows["workers:relay:deployed"]!.problems[0]).toMatch(/no route comlink.example.dev\/\*/);
		expect(rows["workers:relay:bindings"]!.problems).toEqual(["COMLINK_SENTRY_SECRET: not bound"]);
	});

	it("passes a Worker with no declared bindings", async () => {
		const rows = ids(await checkWorker(provider(), { ...worker, bindings: [] }));
		expect(rows["workers:relay:bindings"]).toMatchObject({ status: "ok", detail: "none declared" });
	});

	it("fails a deployment that does not serve all traffic", async () => {
		const rows = ids(
			await checkWorker(provider({ latestDeployment: async () => ({ id: "d", active: false }) }), worker)
		);
		expect(rows["workers:relay:deployment"]).toMatchObject({ status: "fail" });
	});

	it("passes an active deployment with no time, and skips a script with no deployment", async () => {
		const active = ids(
			await checkWorker(provider({ latestDeployment: async () => ({ id: "d", active: true }) }), worker)
		);
		expect(active["workers:relay:deployment"]!.detail).toBe("serving all traffic");
		const none = ids(await checkWorker(provider({ latestDeployment: async () => null }), worker));
		expect(none["workers:relay:deployment"]).toMatchObject({ status: "skip" });
	});

	it("skips everything when the provider cannot name the Worker or read Workers", async () => {
		const unnamed = await checkWorker(provider(), { ...worker, script: undefined });
		expect(unnamed.every((r) => r.status === "skip")).toBe(true);
		const blind = await checkWorker(provider({ inspectScript: undefined }), worker);
		expect(blind.every((r) => r.status === "skip")).toBe(true);
		expect(blind[0]!.detail).toMatch(/cannot read its Workers/);
	});

	it("skips the deployment step when the provider cannot list deployments", async () => {
		const rows = ids(await checkWorker(provider({ latestDeployment: undefined }), worker));
		expect(rows["workers:relay:deployment"]).toMatchObject({ status: "skip" });
	});

	it("skips a 403 and a missing token, and fails any other error", async () => {
		const denied = await checkWorker(
			provider({
				inspectScript: async () => {
					throw Object.assign(new Error("forbidden"), { status: 403 });
				},
			}),
			worker
		);
		expect(denied.map((r) => r.status)).toEqual(["skip", "skip", "skip"]);
		const noToken = await checkWorker(
			provider({
				inspectScript: async () => {
					throw Object.assign(new Error("no token"), { name: "AuthError" });
				},
			}),
			worker
		);
		expect(noToken[0]).toMatchObject({ status: "skip", detail: "no token" });
		const broken = await checkWorker(
			provider({
				inspectScript: async () => {
					throw new Error("boom");
				},
			}),
			worker
		);
		expect(broken[0]).toMatchObject({ status: "fail" });
	});

	it("skips, not fails, when the deployments cannot be read", async () => {
		const rows = ids(
			await checkWorker(
				provider({
					latestDeployment: async () => {
						throw Object.assign(new Error("forbidden"), { status: 403 });
					},
				}),
				worker
			)
		);
		expect(rows["workers:relay:deployment"]).toMatchObject({ status: "skip" });
	});
});
