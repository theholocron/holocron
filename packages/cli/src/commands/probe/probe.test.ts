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
		loadedKeys: () => ["source"],
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

	describe("core providers", () => {
		it("shows what loaded, what failed and why, and who offers probes", async () => {
			const { promise, text } = run({
				provider: "core",
				probe: "providers",
				loader: fakeLoader({
					failures: [{ key: "workers", provider: "cloudflare", error: new Error("needs an accountId") }],
				}),
			});
			expect((await promise).status).toBe("fail");
			expect(text()).toContain("source");
			expect(text()).toContain("workers (cloudflare)");
			expect(text()).toContain("needs an accountId");
			expect(text()).toContain("probes offered by  demo");
		});

		it("says when no provider offers probes", async () => {
			const loader = { ...fakeLoader(), probes: () => new Map() } as unknown as PluginLoader;
			const { promise, text } = run({ provider: "core", probe: "providers", loader });
			expect((await promise).status).toBe("ok");
			expect(text()).toContain("no configured provider");
		});
	});
});
