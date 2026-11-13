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
		loaded: { resolved: {} } as LoadedConfig,
		context: { repoRoot: "/tmp" },
		loader: fakeLoader(),
		print: (l) => lines.push(strip(l)),
		onInterrupt: () => () => {},
		...over,
	});
	return { promise, text: () => lines.join("\n") };
}

describe("runProbeCommand", () => {
	it("hands the words after the probe name to the probe, and lists the deps group", async () => {
		read.mockClear();
		const { promise } = run({ provider: "demo", probe: "look", args: ["vitest"] });
		await promise;
		expect(read.mock.calls[0]![0]).toMatchObject({ args: ["vitest"] });
		const listing = run();
		await listing.promise;
		expect(listing.text()).toMatch(/deps\n\s+check/);
	});

	it("sends a probe's rows to stderr when it asks, so they never mix with data on stdout", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const piped: PluginProbes = {
			stream: {
				summary: "Streams.",
				writes: false,
				reportsTo: "stderr",
				run: async (ctx) => ctx.say({ status: "ok", label: "streamed" }),
			},
		};
		await runProbeCommand({
			loaded: { resolved: {} } as LoadedConfig,
			context: { repoRoot: "/tmp" },
			loader: { ...fakeLoader(), probes: () => new Map([["demo", piped]]) } as unknown as PluginLoader,
			provider: "demo",
			probe: "stream",
			onInterrupt: () => () => {},
		});
		expect(strip(err.mock.calls.flat().join("\n"))).toMatch(/streamed/);
		expect(log.mock.calls.flat().join("\n")).not.toMatch(/streamed/);
		err.mockRestore();
		log.mockRestore();
	});

	it("hands --lcov to the probe, and nothing when it was not given", async () => {
		read.mockClear();
		await run({ provider: "demo", probe: "look", lcov: "coverage/docs.lcov" }).promise;
		expect(read.mock.calls[0]![0]).toMatchObject({ lcov: "coverage/docs.lcov" });
		await run({ provider: "demo", probe: "look" }).promise;
		expect(read.mock.calls[1]![0]).not.toHaveProperty("lcov");
	});

	it("runs docs patch as off unless the config says otherwise", async () => {
		for (const resolved of [{}, { repoValidation: {} }, { repoValidation: { docsCoverage: "off" } }]) {
			const { promise, text } = run({
				provider: "docs",
				probe: "patch",
				loaded: { resolved } as LoadedConfig,
				typedoc: () => {
					throw new Error("nothing should be measured");
				},
			});
			expect((await promise).status).toBe("ok");
			expect(text()).toContain("off in this repo's config");
		}
	});

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

	describe("a probe that accepts a token", () => {
		const seen: Array<string | undefined> = [];
		const tokenProbes: PluginProbes = {
			check: {
				summary: "Check a token.",
				writes: false,
				acceptsToken: true,
				run: async (ctx) => {
					argsSeen.push(ctx.args);
					ctx.say({ status: "ok", label: "checked" });
				},
			},
		};
		const argsSeen: Array<readonly string[] | undefined> = [];
		const vault = (values: Record<string, string>) => ({
			providerName: "1password",
			readEnvironment: async () => values,
		});
		function tokenLoader(
			context: { cliTokens?: Record<string, string> } = {},
			values: Record<string, string> = {}
		) {
			seen.push(context.cliTokens?.demo);
			return {
				load: async () => {},
				probes: () => new Map([["demo", tokenProbes]]),
				loadedKeys: () => [],
				loadFailures: () => [],
				has: (k: string) => k === "vault",
				get: () => vault(values),
			} as unknown as PluginLoader;
		}
		const providerTokens = async () => [
			{ envName: "HOLOCRON_DEMO_TOKEN", vendorEnvName: "DEMO_TOKEN", keyringKey: "demo" },
		];
		const base = () => ({
			// The config names one Environment, `Sentinel` (as `dev.environment`); a layer word is always this repo's own.
			loaded: { resolved: { providers: {}, dev: { environment: "Sentinel" } } } as unknown as LoadedConfig,
			provider: "demo",
			probe: "check",
			providerTokens,
			loader: tokenLoader({}, { DEMO_TOKEN: "env-token-value" }),
			makeLoader: (context: { cliTokens?: Record<string, string> }) => tokenLoader(context),
		});

		it("reads the provider's token from --environment and runs the probe with it, never printing it", async () => {
			seen.length = 0;
			const { promise, text } = run({ ...base(), environment: "Sentinel" });
			expect((await promise).status).toBe("ok");
			// The first loader has no token of its own; the one built again for the probe has the Environment's.
			expect(seen).toEqual([undefined, "env-token-value"]);
			// Where the token came from is in `holocron probe --help`, not repeated in the run.
			expect(text()).not.toContain("DEMO_TOKEN");
			expect(text()).not.toContain("env-token-value");
			expect(text()).toContain("checked");
		});

		it("tells the probe the layer when --environment is a layer word, so it can check against that layer", async () => {
			argsSeen.length = 0;
			await run({
				...base(),
				environment: "ci",
				args: ["a.dev"],
				context: { repoRoot: process.cwd() },
			}).promise;
			expect(argsSeen).toEqual([["a.dev", "--layer", "ci"]]);
		});

		it("passes no layer for an Environment named literally, or for a token given another way", async () => {
			argsSeen.length = 0;
			await run({ ...base(), environment: "Sentinel" }).promise;
			await run({ ...base(), chooseToken: async () => ({ token: "pasted" }) }).promise;
			expect(argsSeen).toEqual([[], []]);
		});

		it("builds its own loader when none is injected, and keeps the probe it already has if the rebuilt loader lacks it", async () => {
			const built: Array<Record<string, string> | undefined> = [];
			const empty = (context: { cliTokens?: Record<string, string> }) => {
				built.push(context.cliTokens);
				return { ...tokenLoader(context), probes: () => new Map() } as unknown as PluginLoader;
			};
			const { promise } = run({
				...base(),
				loader: undefined,
				makeLoader: (context: { cliTokens?: Record<string, string> }) =>
					built.length === 0
						? (built.push(undefined), tokenLoader(context, { DEMO_TOKEN: "env-token-value" }))
						: empty(context),
				environment: "Sentinel",
			});
			expect((await promise).status).toBe("ok");
			expect(built).toHaveLength(2);
		});

		it("refuses an Environment the config does not name, and runs nothing", async () => {
			argsSeen.length = 0;
			const { promise, text } = run({ ...base(), environment: "Elsewhere" });
			expect((await promise).status).toBe("fail");
			expect(text()).toContain("Elsewhere is not an Environment this repo's config names");
			expect(argsSeen).toEqual([]);
		});

		it("builds the loader again with the Environment's token as the provider's", async () => {
			const contexts: Array<Record<string, string> | undefined> = [];
			await run({
				...base(),
				environment: "Sentinel",
				makeLoader: (context: { cliTokens?: Record<string, string> }) => {
					contexts.push(context.cliTokens);
					return tokenLoader(context);
				},
			}).promise;
			expect(contexts).toEqual([{ demo: "env-token-value" }]);
		});

		it("fails with the reason when the Environment cannot be read or holds no token", async () => {
			const none = run({ ...base(), environment: "Sentinel", loader: tokenLoader({}, { OTHER: "x" }) });
			expect((await none.promise).status).toBe("fail");
			expect(none.text()).toContain("holds none of HOLOCRON_DEMO_TOKEN, DEMO_TOKEN");
			const noVault = run({
				...base(),
				environment: "Sentinel",
				loader: { ...tokenLoader(), has: () => false } as unknown as PluginLoader,
			});
			expect((await noVault.promise).status).toBe("fail");
			expect(noVault.text()).toContain("needs a vault provider");
		});

		it("asks which token on a terminal when none was given, and uses a pasted one", async () => {
			const contexts: Array<Record<string, string> | undefined> = [];
			const chooseToken = vi.fn(async () => ({ token: "pasted-token" }));
			const { promise } = run({
				...base(),
				chooseToken,
				makeLoader: (context: { cliTokens?: Record<string, string> }) => {
					contexts.push(context.cliTokens);
					return tokenLoader(context);
				},
			});
			expect((await promise).status).toBe("ok");
			expect(chooseToken).toHaveBeenCalledWith("demo");
			expect(contexts).toEqual([{ demo: "pasted-token" }]);
		});

		it("keeps the configured token when the answer is that one", async () => {
			const makeLoader = vi.fn(tokenLoader);
			const { promise } = run({ ...base(), chooseToken: async () => undefined, makeLoader });
			expect((await promise).status).toBe("ok");
			expect(makeLoader).not.toHaveBeenCalled();
		});

		it("does not ask when a token was given with --token", async () => {
			const chooseToken = vi.fn(async () => undefined);
			await run({ ...base(), chooseToken, context: { repoRoot: "/tmp", cliTokens: { demo: "given" } } }).promise;
			await run({ ...base(), chooseToken, context: { repoRoot: "/tmp", cliToken: "given" } }).promise;
			expect(chooseToken).not.toHaveBeenCalled();
		});

		it("leaves a probe that does not take a token alone", async () => {
			const chooseToken = vi.fn(async () => ({ token: "x" }));
			const { promise } = run({ provider: "demo", probe: "look", chooseToken, environment: "Sentinel" });
			expect((await promise).status).toBe("ok");
			expect(chooseToken).not.toHaveBeenCalled();
		});
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
			loaded: { resolved: {} } as LoadedConfig,
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
		expect([...pick.mock.calls[0]![0].keys()].sort()).toEqual([
			"ci",
			"comlink",
			"core",
			"demo",
			"deps",
			"docs",
			"generated",
			"specs",
			"tasks",
		]);
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
