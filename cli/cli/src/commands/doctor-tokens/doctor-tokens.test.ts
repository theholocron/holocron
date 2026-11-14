import { stripVTControlCharacters } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/index.js";
import type { PluginLoader, PluginProbes, ProbeContext } from "../../plugin/index.js";
import type { PluginToken } from "../auth/index.js";
import { runDoctorTokens } from "./doctor-tokens.js";

const CI_SECRET = "ci-token-VALUE-123";
const DEV_SECRET = "dev-token-VALUE-456";
const gitExec = async () => "git@github.com:acme/demo.git\n";

type Body = (ctx: ProbeContext) => Promise<void> | void;

const TOKEN = (over: Partial<PluginToken> = {}): PluginToken => ({
	envName: "HOLOCRON_DEMO_TOKEN",
	keyringKey: "demo",
	expect: { permissions: { ci: { pages: "required", dns: "absent" }, dev: { pages: "required" } } },
	...over,
});

interface Fakes {
	/** Environment name to its variables; one that is missing throws, as `op` does. */
	environments?: Record<string, Record<string, string>>;
	tokens?: PluginToken[] | Error;
	probes?: PluginProbes | null;
	body?: Body;
	vault?: "none" | "cannot-read";
	providers?: Record<string, unknown>;
}

async function run(fakes: Fakes = {}) {
	const lines: string[] = [];
	const environments = fakes.environments ?? {
		"acme/demo - ci": { HOLOCRON_DEMO_TOKEN: CI_SECRET },
		"acme/demo - dev": { HOLOCRON_DEMO_TOKEN: DEV_SECRET },
	};
	const readEnvironment = vi.fn(async (name: string) => {
		const found = environments[name];
		if (!found) throw new Error(`no Environment ${name}`);
		return found;
	});
	const seenTokens: Array<string | undefined> = [];
	const seenArgs: Array<readonly string[]> = [];
	const probes: PluginProbes =
		fakes.probes === null
			? {}
			: (fakes.probes ?? {
					token: {
						summary: "Check the token.",
						writes: false,
						acceptsToken: true,
						run: async (ctx: ProbeContext) => {
							seenArgs.push(ctx.args ?? []);
							await (fakes.body ?? ((c) => c.say({ status: "ok", label: "pages" })))(ctx);
						},
					},
				});
	const loaderFor = (context?: { cliTokens?: Record<string, string> }) => {
		seenTokens.push(context?.cliTokens?.demo);
		return {
			load: async () => undefined,
			loadedKeys: () => ["vault"],
			loadFailures: () => [],
			has: (key: string) => key === "vault" && fakes.vault !== "none",
			get: () =>
				fakes.vault === "cannot-read"
					? { providerName: "doppler" }
					: { providerName: "1password", readEnvironment },
			probes: () => new Map([["demo", probes]]),
		} as unknown as PluginLoader;
	};
	const report = await runDoctorTokens({
		loaded: {
			resolved: resolveConfig({
				name: "demo",
				org: "acme",
				providers: fakes.providers ?? { vault: "1password", logs: "demo" },
			} as never),
			filepath: "/tmp/x",
		},
		context: { repoRoot: "/tmp" },
		loader: loaderFor(),
		makeLoader: (context) => loaderFor(context),
		providerTokens: async (provider) => {
			if (fakes.tokens instanceof Error) throw fakes.tokens;
			return provider === "demo" ? (fakes.tokens ?? [TOKEN()]) : [];
		},
		gitExec,
		print: (line) => lines.push(stripVTControlCharacters(line)),
		logger: { info: vi.fn() } as never,
	});
	return { report, text: lines.join("\n"), readEnvironment, seenTokens, seenArgs };
}

const rowOf = (report: Awaited<ReturnType<typeof run>>["report"], id: string) => report.rows.find((r) => r.id === id)!;
afterEach(() => vi.restoreAllMocks());

describe("doctor tokens", () => {
	it("runs the token probe for each token and layer it is declared for, with its name and layer, and passes", async () => {
		const { report, seenArgs, seenTokens } = await run();
		expect(report.status).toBe("ok");
		expect(report.rows.map((r) => r.id)).toEqual([
			"tokens:1password",
			"tokens:dev:demo:HOLOCRON_DEMO_TOKEN",
			"tokens:ci:demo:HOLOCRON_DEMO_TOKEN",
		]);
		expect(rowOf(report, "tokens:dev:demo:HOLOCRON_DEMO_TOKEN")).toMatchObject({
			status: "ok",
			title: "dev: HOLOCRON_DEMO_TOKEN (demo)",
			detail: "1 check passed",
		});
		expect(rowOf(report, "tokens:ci:demo:HOLOCRON_DEMO_TOKEN").status).toBe("ok");
		expect(seenArgs).toEqual([
			["--layer", "dev", "--token-name", "HOLOCRON_DEMO_TOKEN"],
			["--layer", "ci", "--token-name", "HOLOCRON_DEMO_TOKEN"],
		]);
		expect(seenTokens.filter(Boolean)).toEqual([DEV_SECRET, CI_SECRET]);
	});

	it("fails on a permission it must not have, and on one it lacks, and never prints a token", async () => {
		const { report, text } = await run({
			environments: {
				"acme/demo - ci": { HOLOCRON_DEMO_TOKEN: CI_SECRET },
				"acme/demo - dev": { HOLOCRON_DEMO_TOKEN: CI_SECRET },
			},
			body: ({ say, args }) => {
				say({ status: "fail", label: "dns", detail: `has it, token ${CI_SECRET} (${(args ?? []).join(" ")})` });
				say({ status: "fail", label: "pages", detail: "no access" });
			},
		});
		expect(report.status).toBe("fail");
		const failed = rowOf(report, "tokens:ci:demo:HOLOCRON_DEMO_TOKEN");
		expect(failed).toMatchObject({ status: "fail", detail: "2 of 2 checks failed" });
		expect(failed.problems[1]).toBe("pages: no access");
		expect(text).not.toContain(CI_SECRET);
		expect(JSON.stringify(report.rows)).not.toContain(CI_SECRET);
	});

	it("fails a layer that should hold the token and does not, and one that holds none of the plugin's tokens", async () => {
		const missing = await run({
			tokens: [TOKEN(), TOKEN({ envName: "HOLOCRON_DEMO_OTHER" })],
			environments: {
				"acme/demo - ci": { HOLOCRON_DEMO_TOKEN: CI_SECRET },
				"acme/demo - dev": { HOLOCRON_DEMO_TOKEN: DEV_SECRET },
			},
		});
		expect(rowOf(missing.report, "tokens:ci:demo:HOLOCRON_DEMO_OTHER")).toMatchObject({
			status: "fail",
			detail: "not held in acme/demo - ci",
		});
		expect(rowOf(missing.report, "tokens:ci:demo:HOLOCRON_DEMO_TOKEN").status).toBe("ok");

		const none = await run({
			environments: { "acme/demo - ci": { OTHER: "x" }, "acme/demo - dev": { HOLOCRON_DEMO_TOKEN: DEV_SECRET } },
		});
		expect(rowOf(none.report, "tokens:ci:demo:HOLOCRON_DEMO_TOKEN")).toMatchObject({
			status: "fail",
			detail: "not held in this layer",
		});
		expect(none.report.status).toBe("fail");
	});

	it("skips, with the reason, a layer whose Environment cannot be read", async () => {
		const { report } = await run({ environments: { "acme/demo - dev": { HOLOCRON_DEMO_TOKEN: DEV_SECRET } } });
		expect(rowOf(report, "tokens:ci:demo:HOLOCRON_DEMO_TOKEN")).toMatchObject({ status: "skip" });
		expect(rowOf(report, "tokens:ci:demo:HOLOCRON_DEMO_TOKEN").detail).toContain("could not read the Environment");
		expect(report.status).toBe("ok");
	});

	it("skips every layer when there is no vault that reads an Environment", async () => {
		for (const vault of ["none", "cannot-read"] as const) {
			const { report } = await run({ vault });
			expect(report.status).toBe("skip");
			expect(report.rows.every((r) => r.status === "skip")).toBe(true);
			expect(report.reason).toContain("needs a vault provider");
		}
	});

	it("reports a probe that throws as a failing row", async () => {
		const { report } = await run({
			environments: {
				"acme/demo - ci": { HOLOCRON_DEMO_TOKEN: CI_SECRET },
				"acme/demo - dev": { HOLOCRON_DEMO_TOKEN: CI_SECRET },
			},
			body: () => {
				throw new Error(`boom ${CI_SECRET}`);
			},
		});
		const failed = rowOf(report, "tokens:ci:demo:HOLOCRON_DEMO_TOKEN");
		expect(failed.status).toBe("fail");
		expect(JSON.stringify(report.rows)).not.toContain(CI_SECRET);
	});

	it("reports a probe that cannot be built from the reloaded loader as a failing row, never the token", async () => {
		const lines: string[] = [];
		const base = {
			load: async () => undefined,
			loadedKeys: () => ["vault"],
			loadFailures: () => [],
			has: () => true,
			get: () => ({
				providerName: "1password",
				readEnvironment: async () => ({ HOLOCRON_DEMO_TOKEN: CI_SECRET }),
			}),
			probes: () =>
				new Map([
					["demo", { token: { summary: "s", writes: false, acceptsToken: true, run: async () => {} } }],
				]),
		};
		const report = await runDoctorTokens({
			loaded: {
				resolved: resolveConfig({
					name: "demo",
					org: "acme",
					providers: { vault: "1password", logs: "demo" },
				} as never),
				filepath: "/tmp/x",
			},
			context: { repoRoot: "/tmp" },
			loader: base as never,
			makeLoader: () =>
				({
					...base,
					load: async () => {
						throw new Error(`cannot load ${CI_SECRET}`);
					},
				}) as never,
			providerTokens: async (p) => (p === "demo" ? [TOKEN()] : []),
			gitExec,
			print: (l) => lines.push(l),
			logger: { info: vi.fn() } as never,
		});
		expect(report.status).toBe("fail");
		expect(JSON.stringify(report.rows)).not.toContain(CI_SECRET);
		expect(JSON.stringify(report.rows)).toContain("[redacted]");
	});

	it("falls back to the first loader's probe when the reloaded one lacks it", async () => {
		const first = {
			token: {
				summary: "s",
				writes: false,
				acceptsToken: true,
				run: async (c: ProbeContext) => c.say({ status: "ok", label: "x" }),
			},
		};
		const base = {
			load: async () => undefined,
			loadedKeys: () => ["vault"],
			loadFailures: () => [],
			has: () => true,
			get: () => ({
				providerName: "1password",
				readEnvironment: async () => ({ HOLOCRON_DEMO_TOKEN: CI_SECRET }),
			}),
		};
		const report = await runDoctorTokens({
			loaded: {
				resolved: resolveConfig({
					name: "demo",
					org: "acme",
					providers: { vault: "1password", logs: "demo" },
				} as never),
				filepath: "/tmp/x",
			},
			context: { repoRoot: "/tmp" },
			loader: { ...base, probes: () => new Map([["demo", first]]) } as never,
			makeLoader: () => ({ ...base, probes: () => new Map() }) as never,
			providerTokens: async (p) => (p === "demo" ? [TOKEN()] : []),
			gitExec,
			print: () => {},
			logger: { info: vi.fn() } as never,
		});
		expect(report.status).toBe("ok");
	});

	it("skips, never fails, a provider with no declared layers, no token probe, or tokens that cannot be read", async () => {
		const noLayers = await run({ tokens: [{ envName: "X", keyringKey: "x" }] });
		expect(rowOf(noLayers.report, "tokens:demo")).toMatchObject({ status: "skip" });
		expect(rowOf(noLayers.report, "tokens:demo").detail).toContain("declares no token layers");
		expect(noLayers.report.status).toBe("skip");

		const noProbe = await run({ probes: null });
		expect(rowOf(noProbe.report, "tokens:demo").detail).toContain("no `token` probe");

		const plainProbe = await run({ probes: { token: { summary: "s", writes: false, run: async () => {} } } });
		expect(rowOf(plainProbe.report, "tokens:demo").status).toBe("skip");

		const unreadable = await run({ tokens: new Error("plugin missing") });
		expect(rowOf(unreadable.report, "tokens:demo").detail).toContain("could not read its tokens: plugin missing");
		expect(unreadable.report.status).toBe("skip");
	});

	it("is a skip with a reason when the config names no provider", async () => {
		const { report } = await run({ providers: {} });
		expect(report).toMatchObject({ status: "skip", rows: [], reason: "no plugin declares a token layer" });
	});

	it("counts a provider named by a many-capability entry once", async () => {
		const { report } = await run({ providers: { vault: "1password", tooling: ["demo", "demo"] } });
		expect(report.rows.filter((r) => r.id.startsWith("tokens:ci:demo")).length).toBe(1);
	});

	it("builds the default loader from the config and prints through the console by default", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const { PluginLoader } = await import("../../plugin/index.js");
		const spy = vi.spyOn(PluginLoader.prototype, "load").mockResolvedValue(undefined as never);
		vi.spyOn(PluginLoader.prototype, "loadFailures").mockReturnValue([
			{ key: "x", provider: "x", error: new Error("e") },
		] as never);
		vi.spyOn(PluginLoader.prototype, "loadedKeys").mockReturnValue(["vault"] as never);
		vi.spyOn(PluginLoader.prototype, "probes").mockReturnValue(new Map());
		const report = await runDoctorTokens({
			loaded: {
				resolved: resolveConfig({ name: "demo", org: "acme", providers: {} } as never),
				filepath: "/tmp/x",
			},
			context: { repoRoot: "/tmp" },
			providerTokens: async () => [],
		});
		expect(spy).toHaveBeenCalled();
		expect(report.status).toBe("skip");
		expect(log).toHaveBeenCalled();
	});
});
