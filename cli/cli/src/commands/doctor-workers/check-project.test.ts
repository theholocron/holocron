import { describe, expect, it } from "vitest";

import type { Deployment, DeploymentRecord } from "../../plugin/index.js";
import { checkProject } from "./check-project.js";

const record = (over: Partial<DeploymentRecord> = {}): DeploymentRecord => ({
	id: "d",
	url: "https://x",
	branch: "main",
	status: "ready",
	createdAt: "2026-02-01T00:00:00Z",
	...over,
});

const provider = (over: Partial<Deployment> = {}): Deployment =>
	({
		key: "deployment",
		providerName: "vercel",
		listProjects: async () => [{ id: "prj_1", name: "sentinel" }],
		listDomains: async () => ["sentinel.example.dev"],
		latestDeployment: async () => record(),
		...over,
	}) as Deployment;

const declared = { project: "sentinel", hostname: "sentinel.example.dev" };
const byId = (rows: Awaited<ReturnType<typeof checkProject>>) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe("checkProject", () => {
	it("passes a project that exists, has its domain and a ready deployment", async () => {
		const rows = await checkProject(provider(), declared);
		expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
		expect(rows[2]!.detail).toBe("ready, 2026-02-01T00:00:00Z");
	});

	it("finds the project by id as well as by name, ignoring case", async () => {
		expect((await checkProject(provider(), { project: "prj_1" }))[0]).toMatchObject({ status: "ok" });
		expect((await checkProject(provider(), { project: "SENTINEL" }))[0]).toMatchObject({ status: "ok" });
	});

	it("has no domain row when none is declared", async () => {
		const rows = await checkProject(provider(), { project: "sentinel" });
		expect(rows.map((r) => r.id)).toEqual(["deployment:sentinel:exists", "deployment:sentinel:deployment"]);
	});

	it("fails a project that is not there and skips what needs it", async () => {
		const rows = byId(await checkProject(provider({ listProjects: async () => [] }), declared));
		expect(rows["deployment:sentinel:exists"]).toMatchObject({ status: "fail" });
		expect(rows["deployment:sentinel:domain"]).toMatchObject({ status: "skip" });
		expect(rows["deployment:sentinel:deployment"]).toMatchObject({ status: "skip" });
	});

	it("fails a domain that is not attached", async () => {
		const rows = byId(await checkProject(provider({ listDomains: async () => ["other.dev"] }), declared));
		expect(rows["deployment:sentinel:domain"]).toMatchObject({ status: "fail" });
		expect(rows["deployment:sentinel:domain"]!.problems[0]).toMatch(/attaches it/);
	});

	it("fails an errored deployment and carries the provider's reason", async () => {
		const rows = byId(
			await checkProject(
				provider({ latestDeployment: async () => record({ status: "error", errorMessage: "Build failed" }) }),
				declared
			)
		);
		const row = rows["deployment:sentinel:deployment"]!;
		expect(row.status).toBe("fail");
		expect(row.problems[0]).toMatch(/failed: Build failed/);
		const bare = byId(
			await checkProject(provider({ latestDeployment: async () => record({ status: "error" }) }), declared)
		);
		expect(bare["deployment:sentinel:deployment"]!.problems[0]).not.toContain(": undefined");
	});

	it("treats a building, queued or cancelled deployment as information, and none as a skip", async () => {
		for (const status of ["building", "queued", "cancelled"] as const) {
			const rows = byId(
				await checkProject(provider({ latestDeployment: async () => record({ status }) }), declared)
			);
			expect(rows["deployment:sentinel:deployment"]).toMatchObject({
				status: "skip",
				detail: `info: the newest deployment is ${status}`,
			});
		}
		const none = byId(await checkProject(provider({ latestDeployment: async () => null }), declared));
		expect(none["deployment:sentinel:deployment"]).toMatchObject({ status: "skip" });
	});

	it("ready without a time still passes", async () => {
		const rows = await checkProject(
			provider({ latestDeployment: async () => record({ createdAt: undefined }) }),
			declared
		);
		expect(rows[2]).toMatchObject({ status: "ok", detail: "ready" });
	});

	it("skips steps the provider cannot do", async () => {
		const rows = byId(
			await checkProject(provider({ listDomains: undefined, latestDeployment: undefined }), declared)
		);
		expect(rows["deployment:sentinel:domain"]).toMatchObject({ status: "skip" });
		expect(rows["deployment:sentinel:deployment"]).toMatchObject({ status: "skip" });
	});

	it("skips a 403 on any read, and fails an error that is not about access", async () => {
		const denied = () => {
			throw Object.assign(new Error("forbidden"), { status: 403 });
		};
		const rows = await checkProject(
			provider({
				listProjects: async () => denied(),
				listDomains: async () => denied(),
				latestDeployment: async () => denied(),
			}),
			declared
		);
		expect(rows.every((r) => r.status === "skip")).toBe(true);

		const withProject = byId(
			await checkProject(
				provider({ listDomains: async () => denied(), latestDeployment: async () => denied() }),
				declared
			)
		);
		expect(withProject["deployment:sentinel:domain"]).toMatchObject({ status: "skip" });
		expect(withProject["deployment:sentinel:deployment"]).toMatchObject({ status: "skip" });

		const broken = await checkProject(
			provider({
				listProjects: async () => {
					throw new Error("boom");
				},
			}),
			declared
		);
		expect(broken[0]).toMatchObject({ status: "fail" });
	});
});
