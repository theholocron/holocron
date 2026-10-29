import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, PluginProbes } from "../../plugin/index.js";
import { runProbeCommand } from "./probe.js";

const strip = (s: string) => stripVTControlCharacters(s);

const read = vi.fn(async (ctx: { say: (r: { status: "ok"; label: string }) => void }) =>
	ctx.say({ status: "ok", label: "looked" })
);
const probes: PluginProbes = {
	look: { summary: "Look at things.", writes: false, run: read },
	make: { summary: "Make a thing.", writes: true, run: async () => {} },
};

function fakeLoader(over: { failures?: Array<{ key: string; provider: string; error: Error }> } = {}) {
	return {
		load: async () => {},
		probes: () => new Map([["demo", probes]]),
		loadedKeys: () => ["source", "ci"],
		get: (key: string) => (key === "source" ? { providerName: "github" } : [{ providerName: "demo" }, {}]),
		loadFailures: () => over.failures ?? [],
	} as unknown as PluginLoader;
}

function run(over: Partial<Parameters<typeof runProbeCommand>[0]> = {}) {
	const lines: string[] = [];
	const promise = runProbeCommand({
		loaded: {} as LoadedConfig,
		context: { repoRoot: "/tmp" },
		loader: fakeLoader(),
		print: (l) => lines.push(strip(l)),
		onInterrupt: () => () => {},
		...over,
	});
	return { promise, text: () => lines.join("\n") };
}

describe("runProbeCommand", () => {
	it("lists every provider and probe, marking the ones that change things", async () => {
		const { promise, text } = run();
		expect((await promise).status).toBe("listed");
		expect(text()).toMatch(/core\n\s+providers/);
		expect(text()).toContain("demo");
		expect(text()).toMatch(/look\s+Look at things\./);
		expect(text()).toMatch(/make\s+Make a thing\.\s+\(changes things\)/);
	});

	it("lists one provider's probes", async () => {
		const { promise, text } = run({ provider: "demo" });
		expect((await promise).status).toBe("listed");
		expect(text()).toContain("look");
		expect(text()).not.toContain("providers");
	});

	it("says what is available for an unknown provider or probe", async () => {
		const noProvider = run({ provider: "nope" });
		expect((await noProvider.promise).status).toBe("fail");
		expect(noProvider.text()).toContain("no probes for `nope`");
		expect(noProvider.text()).toContain("core, demo");
		const noProbe = run({ provider: "demo", probe: "nope" });
		expect((await noProbe.promise).status).toBe("fail");
		expect(noProbe.text()).toContain("has no probe `nope`");
		expect(noProbe.text()).toContain("look, make");
	});

	it("runs a probe and reports its outcome", async () => {
		const { promise, text } = run({ provider: "demo", probe: "look" });
		expect((await promise).status).toBe("ok");
		expect(text()).toContain("looked");
	});

	it("scrubs the run's own tokens from a probe's output", async () => {
		const leaky: PluginProbes = {
			leak: {
				summary: "x",
				writes: false,
				run: async (ctx) => ctx.say({ status: "info", label: "token is cli-token-value" }),
			},
		};
		const loader = { ...fakeLoader(), probes: () => new Map([["demo", leaky]]) } as unknown as PluginLoader;
		const { promise, text } = run({
			provider: "demo",
			probe: "leak",
			loader,
			context: { repoRoot: "/tmp", cliToken: "cli-token-value", cliTokens: { demo: "per-provider-token" } },
		});
		await promise;
		expect(text()).not.toContain("cli-token-value");
		expect(text()).toContain("«hidden»");
	});

	it("passes --dry-run and --yes through to a probe that writes", async () => {
		const { promise, text } = run({ provider: "demo", probe: "make", dryRun: true });
		expect((await promise).status).toBe("ok");
		expect(text()).not.toContain("would");
		const yes = run({ provider: "demo", probe: "make", yes: true, interactive: false });
		expect((await yes.promise).status).toBe("ok");
		const asked = vi.fn(async () => false);
		const declined = run({ provider: "demo", probe: "make", interactive: true, confirm: asked });
		expect((await declined.promise).status).toBe("cancelled");
		expect(asked).toHaveBeenCalled();
	});

	it("looks for the Comlink app's own vault under the repo root when `comlink deliver` needs the secret", async () => {
		const loader = {
			load: async () => {},
			probes: () => new Map(),
			loadedKeys: () => [],
			loadFailures: () => [],
			has: (k: string) => k === "notifications" || k === "errors",
			get: (k: string) =>
				k === "notifications"
					? [{ providerName: "discord", layout: { relay: { host: "comlink.example.dev" } } }]
					: { providerName: "sentry" },
		} as unknown as PluginLoader;
		const { promise, text } = run({
			provider: "comlink",
			probe: "deliver",
			yes: true,
			loader,
			context: { repoRoot: "/nonexistent-repo-root" },
		});
		expect((await promise).status).toBe("fail");
		expect(text()).toContain("give apps/comlink/holocron.config a vault");
	});

	describe("core providers", () => {
		it("shows what loaded, what failed and why, and who offers probes", async () => {
			const { promise, text } = run({
				provider: "core",
				probe: "providers",
				loader: fakeLoader({
					failures: [
						{ key: "workers", provider: "cloudflare", error: new Error("needs an accountId") },
						{ key: "dns", provider: "cloudflare", error: new Error("needs an accountId") },
						{ key: "ci", provider: "demo", error: new Error("rate limited") },
						{ key: "logs", provider: "axiom", error: new Error("no token") },
					],
				}),
			});
			expect((await promise).status).toBe("fail");
			expect(text()).toContain("source");
			expect(text()).toContain("workers (cloudflare)");
			expect(text()).toContain("needs an accountId");
			// A provider that only failed is still listed under Providers, once, with why.
			expect(text()).toMatch(/Providers[\s\S]*✗ cloudflare\s+did not load: .*needs an accountId/);
			const providers = text().slice(text().indexOf("Providers"));
			expect(providers.match(/✗ cloudflare/g)).toHaveLength(1);
			// A provider that loaded for something else is listed by its probes, not as failed.
			expect(providers).not.toMatch(/✗ demo/);
			expect(providers.indexOf("✗ axiom")).toBeLessThan(providers.indexOf("✗ cloudflare"));
			expect(text()).toMatch(/Capabilities[\s\S]*Providers/);
			expect(text()).toMatch(/demo\s+look, make/);
			expect(text()).toMatch(/github\s+no probes yet/);
			// A provider with probes is a check mark; one without stays dim until it has some.
			expect(text()).toMatch(/✓ demo\s+look, make/);
			expect(text()).toMatch(/· github\s+no probes yet/);
			expect(text()).toMatch(/✓ comlink \(built in\)/);
			expect(text()).toMatch(/comlink \(built in\)\s+bindings, deliver, unsigned/);
		});

		it("says when a provider offers no probes", async () => {
			const loader = { ...fakeLoader(), probes: () => new Map() } as unknown as PluginLoader;
			const { promise, text } = run({ provider: "core", probe: "providers", loader });
			expect((await promise).status).toBe("ok");
			expect(text()).toMatch(/demo\s+no probes yet/);
		});
	});

	it("prints to the console when given nothing to print to, and listens for Ctrl-C itself when not told how", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const before = process.listenerCount("SIGINT");
		const report = await runProbeCommand({
			loaded: {} as LoadedConfig,
			context: { repoRoot: "/tmp" },
			loader: fakeLoader(),
			provider: "demo",
			probe: "look",
		});
		expect(report.status).toBe("ok");
		expect(log.mock.calls.flat().join("\n")).toContain("looked");
		expect(process.listenerCount("SIGINT")).toBe(before);
		log.mockRestore();
	});

	it("hands the probes to a menu instead of printing the list, when given one", async () => {
		const pick = vi.fn(async (_groups: ReadonlyMap<string, PluginProbes>) => {});
		const { promise, text } = run({ pick });
		expect((await promise).status).toBe("listed");
		expect([...pick.mock.calls[0]![0].keys()].sort()).toEqual(["comlink", "core", "demo", "docs"]);
		expect(text()).toBe("");
	});

	it("still names a provider when it is given one, menu or not", async () => {
		const pick = vi.fn(async (_groups: ReadonlyMap<string, PluginProbes>) => {});
		const { promise, text } = run({ pick, provider: "demo" });
		await promise;
		expect(pick).not.toHaveBeenCalled();
		expect(text()).toContain("look");
	});
});
