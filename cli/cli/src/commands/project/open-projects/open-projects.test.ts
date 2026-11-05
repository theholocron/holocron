import { describe, expect, it, vi } from "vitest";

const constructed = vi.hoisted(() => vi.fn());
vi.mock("../../../plugin/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../../plugin/index.js")>()),
	PluginLoader: class {
		constructor(...args: unknown[]) {
			constructed(...args);
		}
		load = async () => {};
		loadedKeys = () => ["projects"];
		loadFailures = () => [];
		has = () => true;
		get = () => "the-projects";
	},
}));

import { ConfigError } from "../../../config/index.js";
import type { PluginLoader } from "../../../plugin/index.js";
import { loadedWith } from "../project-test-kit/index.js";
import { openProjects } from "./open-projects.js";

const stubLoader = (over: Partial<Record<"has" | "loadFailures", unknown>> = {}) =>
	({
		load: async () => {},
		loadedKeys: () => ["projects"],
		loadFailures: () => [],
		has: () => true,
		get: () => "the-projects",
		...over,
	}) as unknown as PluginLoader;

const withOptions = (options: unknown = {}, org = "acme") => loadedWith({ projects: ["github", options] }, org);

describe("openProjects", () => {
	it("builds its own loader from the resolved config and context when none is given", async () => {
		const loaded = withOptions();
		const context = { repoRoot: "/tmp/test", org: "acme" };
		const opened = await openProjects({ loaded, context }, "project list");
		expect(constructed).toHaveBeenCalledWith(loaded.resolved, context);
		expect(opened.projects).toBe("the-projects");
		expect(opened.options.owner).toBe("acme");
	});

	it("names the failure when the provider did not load", async () => {
		const loader = stubLoader({
			has: () => false,
			loadFailures: () => [{ key: "projects", provider: "github", error: new Error("no token") }],
		});
		const err = await openProjects(
			{ loaded: withOptions(), context: { repoRoot: "/x" }, loader },
			"project list"
		).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/`github` failed to load: .*no token/);
	});

	it("says only that it is not available when nothing failed to load", async () => {
		const loader = stubLoader({ has: () => false });
		const err = await openProjects(
			{ loaded: withOptions(), context: { repoRoot: "/x" }, loader },
			"project list"
		).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toBe("project list: the `projects` provider is not available");
	});

	it("reports wrong provider options", async () => {
		const loaded = withOptions({ templates: "" });
		const err = await openProjects(
			{ loaded, context: { repoRoot: "/x" }, loader: stubLoader() },
			"project list"
		).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/providers.projects is wrong/);
	});

	it("needs an owner from the flag, the context or the options", async () => {
		const loaded = withOptions();
		const err = await openProjects(
			{ loaded, context: { repoRoot: "/x" }, loader: stubLoader() },
			"project list"
		).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/needs an owner/);
	});

	it("prefers the owner flag over the context's org", async () => {
		const opened = await openProjects(
			{ loaded: withOptions(), context: { repoRoot: "/x", org: "ctx" }, owner: "flag", loader: stubLoader() },
			"project list"
		);
		expect(opened.options.owner).toBe("flag");
	});
});
