import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/index.js";
import type { Deployment, NotificationsLayout, PluginLoader, Wiki, Workers } from "../../plugin/index.js";
import { declaredProjects } from "./declared-projects.js";
import { declaredWorkers } from "./declared-workers.js";
import { runDoctorWorkers } from "./doctor-workers.js";

const relayLayout = (over: Record<string, unknown> = {}): NotificationsLayout =>
	({
		categories: [{ name: "c", channels: [{ name: "errors", feeds: { errors: true } }] }],
		relay: { host: "comlink.example.dev", ...over },
	}) as unknown as NotificationsLayout;

const wikiWithProxy = {
	proxyConfig: () => ({ target: "t", headers: {} }),
	dnsRecord: () => ({ zone: "example.dev", record: { type: "CNAME", name: "wiki.example.dev", content: "x" } }),
} as unknown as Wiki;

describe("declaredWorkers", () => {
	it("declares the relay Worker with the bindings its tracker needs", () => {
		expect(
			declaredWorkers({ layouts: [relayLayout({ script: "relay" })], errors: { providerName: "sentry" } })
		).toEqual([
			{
				label: "relay",
				script: "relay",
				host: "comlink.example.dev",
				bindings: ["COMLINK_SENTRY_WEBHOOK", "COMLINK_SENTRY_SECRET"],
			},
		]);
	});

	it("uses the default script name and no bindings without a tracker", () => {
		const [relay] = declaredWorkers({ layouts: [relayLayout()] });
		expect(relay).toMatchObject({ script: "comlink", bindings: [] });
	});

	it("declares nothing for a layout with no relay host or no error feed", () => {
		expect(declaredWorkers({ layouts: [{} as NotificationsLayout, { relay: {} } as never] })).toEqual([]);
		expect(
			declaredWorkers({
				layouts: [{ categories: [{ name: "c", channels: [{ name: "x" }] }], relay: { host: "h" } } as never],
			})
		).toEqual([]);
	});

	it("declares the wiki's proxy by the name the Workers provider gives it", () => {
		const [proxy] = declaredWorkers({
			layouts: [],
			wiki: wikiWithProxy,
			workers: { proxyScriptName: (host: string) => `${host}-proxy` },
		});
		expect(proxy).toEqual({
			label: "wiki proxy",
			script: "wiki.example.dev-proxy",
			host: "wiki.example.dev",
			bindings: [],
		});
		expect(declaredWorkers({ layouts: [], wiki: wikiWithProxy })[0]!.script).toBeUndefined();
	});

	it("declares no proxy when the wiki needs none", () => {
		expect(declaredWorkers({ layouts: [], wiki: { ...wikiWithProxy, proxyConfig: () => null } as Wiki })).toEqual(
			[]
		);
	});
});

describe("declaredProjects", () => {
	it("is the project named like the repo, with the provider's domain", () => {
		const config = resolveConfig({ name: "demo", org: "acme", providers: {} } as never);
		expect(declaredProjects(config, { domain: "demo.example.dev" })).toEqual([
			{ project: "demo", hostname: "demo.example.dev" },
		]);
		expect(declaredProjects(config, {})).toEqual([{ project: "demo" }]);
	});

	it("is the preview project and its domain when the config carries a preview", () => {
		const config = resolveConfig({
			name: "demo",
			org: "acme",
			domain: "example.dev",
			providers: {},
			tasks: [{ name: "deploy", with: { preview: { project: "demo-pages", domain: "preview.example.dev" } } }],
		} as never);
		const found = declaredProjects(config, { domain: "ignored.example.dev" });
		expect(found).toHaveLength(1);
		expect(found[0]).toEqual({ project: "demo-pages", hostname: "preview.example.dev" });
	});
});

async function run(fakes: {
	workers?: Partial<Workers> | null;
	deployment?: Partial<Deployment> | null;
	layouts?: NotificationsLayout[];
	loadFailures?: { key: string; provider: string; error: Error }[];
}) {
	const lines: string[] = [];
	const made = {
		workers:
			fakes.workers === null || fakes.workers === undefined
				? undefined
				: ({ key: "workers", providerName: "cloudflare", ...fakes.workers } as Workers),
		deployment:
			fakes.deployment === null || fakes.deployment === undefined
				? undefined
				: ({ key: "deployment", providerName: "vercel", ...fakes.deployment } as Deployment),
	};
	const loader = {
		load: async () => undefined,
		loadFailures: () => fakes.loadFailures ?? [],
		loadedKeys: () => Object.keys(made),
		has: (key: string) => key === "notifications" || (key in made && made[key as keyof typeof made] !== undefined),
		get: (key: string) =>
			key === "notifications"
				? (fakes.layouts ?? []).map((l) => ({ layout: l }))
				: made[key as keyof typeof made],
	} as unknown as PluginLoader;
	const report = await runDoctorWorkers({
		loaded: { resolved: resolveConfig({ name: "demo", org: "acme", providers: {} } as never), filepath: "/tmp/x" },
		context: { repoRoot: "/tmp" },
		loader,
		print: (line) => lines.push(line),
		logger: { info: vi.fn() } as never,
	});
	return { report, text: lines.join("\n") };
}

const goodWorkers: Partial<Workers> = {
	inspectScript: async () => ({ exists: true, routes: ["comlink.example.dev/*"], bindingNames: [] }),
	latestDeployment: async () => ({ id: "d", active: true }),
};
const goodDeployment: Partial<Deployment> = {
	listProjects: async () => [{ id: "demo", name: "demo" }],
	latestDeployment: async () => ({ id: "d", url: "u", branch: null, status: "ready" }),
};

describe("doctor workers", () => {
	it("checks a declared Worker and the deployment project", async () => {
		const { report, text } = await run({
			workers: goodWorkers,
			deployment: goodDeployment,
			layouts: [relayLayout()],
		});
		expect(report.status).toBe("ok");
		expect(report.summary.fail).toBe(0);
		expect(text).toContain("relay Worker is deployed and routed");
		expect(text).toContain("demo project exists");
	});

	it("says none are declared when no Worker is", async () => {
		const { report } = await run({ deployment: goodDeployment });
		expect(report.rows[0]).toMatchObject({ id: "workers", status: "ok", detail: "none declared" });
	});

	it("fails when a row fails", async () => {
		const { report } = await run({ deployment: { ...goodDeployment, listProjects: async () => [] } });
		expect(report.status).toBe("fail");
	});

	it("skips declared Workers with the reason when there is no workers provider", async () => {
		const { report } = await run({ deployment: goodDeployment, layouts: [relayLayout()] });
		expect(report.rows.find((r) => r.id === "workers:relay")).toMatchObject({
			status: "skip",
			detail: expect.stringContaining("no `workers` provider"),
		});
	});

	it("skips the whole run, naming a plugin that failed to load, when nothing can be read", async () => {
		const { report } = await run({
			deployment: null,
			loadFailures: [{ key: "deployment", provider: "vercel", error: new Error("boom") }],
		});
		expect(report.rows.find((r) => r.id === "deployment")).toMatchObject({
			status: "skip",
			detail: expect.stringContaining("`vercel` failed to load"),
		});
		const none = await run({ deployment: null });
		expect(none.report.rows.find((r) => r.id === "deployment")!.detail).toMatch(/no `deployment` provider/);
	});

	it("is a skip, with every distinct reason, when every row is a skip", async () => {
		const { report } = await run({ deployment: null, layouts: [relayLayout()] });
		expect(report.status).toBe("skip");
		expect(report.reason).toMatch(/no `workers` provider.*no `deployment` provider/);
	});
});

describe("declaredProjects without a preview domain", () => {
	it("has no hostname for a preview that names none", () => {
		const config = resolveConfig({
			name: "demo",
			org: "acme",
			providers: {},
			tasks: [{ name: "deploy", with: { preview: { project: "demo-pages" } } }],
		} as never);
		expect(declaredProjects(config, {})).toEqual([{ project: "demo-pages" }]);
	});
});
