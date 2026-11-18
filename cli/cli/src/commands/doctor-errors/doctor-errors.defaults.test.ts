import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ loaderArgs: [] as unknown[], notifications: undefined as unknown }));
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
			return key === "errors" || (key === "notifications" && state.notifications !== undefined);
		}
		get(key: string) {
			return key === "errors"
				? {
						providerName: "sentry",
						inspect: async () => ({ org: { slug: "acme", exists: true }, projects: [] }),
					}
				: state.notifications;
		}
	},
}));

import { runDoctorErrors } from "./doctor-errors.js";

afterEach(() => {
	vi.restoreAllMocks();
	state.notifications = undefined;
});

const input = { loaded: { resolved: { name: "demo" } as never, filepath: "/x" }, context: { repoRoot: "/tmp" } };

describe("runDoctorErrors defaults", () => {
	it("builds its own loader, prints to the console and logs through the command logger", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const report = await runDoctorErrors(input);
		expect(state.loaderArgs).toEqual([input.loaded.resolved, input.context]);
		expect(log).toHaveBeenCalled();
		expect(info).toHaveBeenCalledWith(expect.objectContaining({ status: "ok" }), "doctor errors");
		expect(report.status).toBe("ok");
	});

	it("ignores a notifications provider that has no layout", async () => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		state.notifications = [{}, { layout: { relay: { errors: { projects: ["a"] } } } }];
		const report = await runDoctorErrors(input);
		expect(report.status).toBe("ok");
	});
});
