import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/index.js";
import type { Errors, ErrorsInspection, NotificationsLayout, PluginLoader } from "../../plugin/index.js";
import { declaredProjects } from "./declared-projects.js";
import { runDoctorErrors } from "./doctor-errors.js";

const healthy: ErrorsInspection = {
	org: { slug: "acme", exists: true, name: "Acme" },
	projects: [{ slug: "holocron", exists: true, hasDsn: true, alertRules: 1 }],
};

const layout = (projects?: string[]): NotificationsLayout =>
	({ relay: { host: "r.example", ...(projects ? { errors: { projects } } : {}) } }) as NotificationsLayout;

async function run(fakes: {
	errors?: Partial<Errors> | null;
	layouts?: NotificationsLayout[];
	loadFailures?: { key: string; provider: string; error: Error }[];
}) {
	const lines: string[] = [];
	const errors =
		fakes.errors === null || fakes.errors === undefined
			? undefined
			: ({ key: "errors", providerName: "sentry", describe: async () => ({}), ...fakes.errors } as Errors);
	const loader = {
		load: async () => undefined,
		loadFailures: () => fakes.loadFailures ?? [],
		loadedKeys: () => (errors ? ["errors"] : []),
		has: (key: string) => (key === "errors" ? errors !== undefined : key === "notifications"),
		get: (key: string) => (key === "errors" ? errors : (fakes.layouts ?? []).map((l) => ({ layout: l }))),
	} as unknown as PluginLoader;
	const report = await runDoctorErrors({
		loaded: { resolved: resolveConfig({ name: "demo", org: "acme", providers: {} } as never), filepath: "/tmp/x" },
		context: { repoRoot: "/tmp" },
		loader,
		print: (line) => lines.push(line),
		logger: { info: vi.fn() } as never,
	});
	return { report, text: lines.join("\n") };
}

describe("declaredProjects", () => {
	it("lists each project of every layout once, in order", () => {
		expect(declaredProjects([layout(["a", "b"]), layout(["b", "c"]), layout()])).toEqual(["a", "b", "c"]);
	});
});

describe("doctor errors", () => {
	it("asks for the declared projects and passes when everything is there", async () => {
		const inspect = vi.fn(async () => healthy);
		const { report, text } = await run({ errors: { inspect }, layouts: [layout(["holocron"])] });
		expect(inspect).toHaveBeenCalledWith({ projects: ["holocron"] });
		expect(report.status).toBe("ok");
		expect(report.summary).toEqual({ ok: 4, fail: 0, skip: 0 });
		expect(text).toContain("organization exists");
	});

	it("fails when a row fails", async () => {
		const { report } = await run({
			errors: { inspect: async () => ({ ...healthy, projects: [{ slug: "holocron", exists: false }] }) },
			layouts: [layout(["holocron"])],
		});
		expect(report.status).toBe("fail");
	});

	it("skips with a reason when there is no errors provider", async () => {
		const { report } = await run({ errors: null });
		expect(report).toMatchObject({ status: "skip", reason: expect.stringContaining("no `errors` provider") });
	});

	it("names a provider that failed to load", async () => {
		const { report } = await run({
			errors: null,
			loadFailures: [{ key: "errors", provider: "sentry", error: new Error("boom") }],
		});
		expect(report.reason).toMatch(/`sentry` failed to load/);
	});

	it("skips a provider that cannot inspect", async () => {
		const { report } = await run({ errors: {} });
		expect(report).toMatchObject({ status: "skip", reason: "sentry cannot read its organization" });
	});

	it("skips, never fails, when the read throws", async () => {
		const { report } = await run({
			errors: {
				inspect: async () => {
					throw new Error("Sentry requires `org`");
				},
			},
		});
		expect(report.status).toBe("skip");
		expect(report.reason).toMatch(/could not read sentry: .*requires `org`/);
	});
});
