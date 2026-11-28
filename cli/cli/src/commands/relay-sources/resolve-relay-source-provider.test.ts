import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { resolveRelaySourceProvider } from "./resolve-relay-source-provider.js";

const plugin = (name: string, caps: Record<string, unknown>, seen?: (opts: Record<string, unknown>) => void) => ({
	createPlugin: (opts: Record<string, unknown>) => {
		seen?.(opts);
		return { name, capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])) };
	},
});

async function loaderFor(providers: Record<string, string>, modules: Record<string, unknown>) {
	const config = resolveConfig({ name: "demo", providers });
	const importer = async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg];
	};
	const loader = new PluginLoader(config, { repoRoot: "/tmp/x" }, importer as unknown as PluginImporter);
	await loader.load();
	return { config, loader };
}

const make = (extra: object = {}) => ({
	key: "deployment",
	providerName: "cloudflare",
	ensureRelaySource: vi.fn(),
	...extra,
});

describe("resolveRelaySourceProvider", () => {
	it("takes the options of the root config's own entry for the named plugin before reading the workspace", async () => {
		const seen = vi.fn();
		const { config, loader } = await loaderFor(
			{ deployment: "vercel", dns: "cloudflare" },
			{
				"@theholocron/holocron-plugin-vercel": plugin("vercel", {
					deployment: { key: "deployment", providerName: "vercel" },
				}),
				"@theholocron/holocron-plugin-cloudflare": plugin("cloudflare", { dns: {}, deployment: make() }, seen),
			}
		);
		const workspace = vi.fn(async () => []);
		const out = await resolveRelaySourceProvider({
			loader,
			config,
			repoRoot: "/tmp/x",
			source: { id: "edge", spec: { capability: "deployment", provider: "cloudflare" } },
			workspace,
		});
		expect(out.problem).toBeUndefined();
		expect(out.provider?.providerName).toBe("cloudflare");
		expect(workspace).not.toHaveBeenCalled();
	});

	it("returns the configured provider when the source names none", async () => {
		const { config, loader } = await loaderFor(
			{ deployment: "cloudflare" },
			{ "@theholocron/holocron-plugin-cloudflare": plugin("cloudflare", { deployment: make() }) }
		);
		const out = await resolveRelaySourceProvider({
			loader,
			config,
			repoRoot: "/tmp/x",
			source: { id: "edge", spec: { capability: "deployment" } },
		});
		expect(out.provider?.providerName).toBe("cloudflare");
	});

	it("reads the workspace's own configs by default, and finds no options in a repo that has none", async () => {
		const root = await mkdtemp(join(tmpdir(), "relay-provider-"));
		const { config, loader } = await loaderFor({}, {});
		const out = await resolveRelaySourceProvider({
			loader,
			config,
			repoRoot: root,
			source: { id: "vercel", spec: { capability: "deployment", provider: "vercel" } },
		});
		expect(out.problem).toMatch(/provider `vercel` is named by no `holocron.config`/);
	});

	it("says so when the capability has no configured provider and the source names none", async () => {
		const { config, loader } = await loaderFor({}, {});
		const out = await resolveRelaySourceProvider({
			loader,
			config,
			repoRoot: "/tmp/x",
			source: { id: "edge", spec: { capability: "deployment" } },
		});
		expect(out.problem).toMatch(/no `deployment` provider is configured/);
	});
});
