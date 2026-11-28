import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	loaderArgs: [] as unknown[],
	loaded: {} as Record<string, unknown>,
}));
const info = vi.hoisted(() => vi.fn());

vi.mock("../../observability/logger/index.js", () => ({ getLogger: () => ({ info }) }));
vi.mock("../../plugin/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../plugin/index.js")>()),
	assertPluginsResolvable: () => undefined,
	PluginLoader: class {
		constructor(...args: unknown[]) {
			state.loaderArgs = args;
		}
		async load() {}
		loadFailures() {
			return [];
		}
		has(key: string) {
			return key in state.loaded;
		}
		get(key: string) {
			return state.loaded[key];
		}
	},
}));

import { runDoctorWorkers } from "./doctor-workers.js";

afterEach(() => {
	vi.restoreAllMocks();
	state.loaded = {};
});

const input = {
	loaded: { resolved: { name: "demo", org: "acme", providers: {} } as never, filepath: "/x" },
	context: { repoRoot: "/tmp" },
};

const layout = {
	categories: [{ name: "c", channels: [{ name: "errors", feeds: { errors: true } }] }],
	relay: { host: "comlink.example.dev" },
};

describe("runDoctorWorkers defaults", () => {
	it("builds its own loader, prints to the console and logs through the command logger", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		state.loaded = {
			deployment: { providerName: "vercel", listProjects: async () => [{ id: "demo", name: "demo" }] },
		};
		const report = await runDoctorWorkers(input);
		expect(state.loaderArgs).toEqual([input.loaded.resolved, input.context]);
		expect(log).toHaveBeenCalled();
		expect(info).toHaveBeenCalledWith(expect.objectContaining({ status: report.status }), "doctor workers");
	});

	it("reads the error tracker, the wiki and the Workers provider when they are configured", async () => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		const inspectScript = vi.fn(async (_script: string, _host: string) => ({
			exists: true,
			routes: ["comlink.example.dev/*"],
			bindingNames: [],
		}));
		state.loaded = {
			workers: { providerName: "cloudflare", inspectScript, proxyScriptName: (h: string) => `${h}-proxy` },
			errors: { providerName: "sentry" },
			wiki: {
				proxyConfig: () => ({ target: "t", headers: {} }),
				dnsRecord: () => ({ zone: "z", record: { type: "CNAME", name: "wiki.example.dev", content: "x" } }),
			},
			notifications: [{}, { layout }],
		};
		const report = await runDoctorWorkers(input);
		const scripts = inspectScript.mock.calls.map((c) => c[0]);
		expect(scripts).toEqual(["comlink", "wiki.example.dev-proxy"]);
		expect(report.rows.find((r) => r.id === "workers:relay:bindings")?.status).toBe("fail");
	});
});
