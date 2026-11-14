import { stripVTControlCharacters } from "node:util";

import { clearCredentials, getCredential } from "@theholocron/kyber/secrets";
import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type CredentialsInspection, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import type { AuthImporter } from "../auth/index.js";
import { credentialsRows } from "./credentials-rows.js";

type Raw = Parameters<typeof resolveConfig>[0];

const loadedWith = (extra: Record<string, unknown> = {}): LoadedConfig => ({
	resolved: resolveConfig({
		name: "demo",
		providers: { credentials: ["1password"], source: "github", dns: "cloudflare" },
		credentials: { environment: "Demo" },
		...extra,
	} as Raw),
	filepath: "/tmp/test/holocron.config.json",
});

type Impl = { inspect?: (environment: string) => Promise<CredentialsInspection>; read?: () => Promise<unknown> };

function loaderWith(loaded: LoadedConfig, impl: Impl | null): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (pkg === "@theholocron/holocron-plugin-1password" && impl) {
			return {
				createPlugin: () => ({
					name: "1password",
					capabilities: { credentials: () => ({ key: "credentials", providerName: "1password", ...impl }) },
				}),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		if (pkg === "@theholocron/holocron-plugin-github") {
			return {
				createPlugin: () => ({ name: "github", capabilities: { source: () => ({}) } }),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter, {
		readCredentials: false,
	});
}

const TOKENS = {
	"@theholocron/holocron-plugin-github": { tokens: [{ envName: "HOLOCRON_ORG_TOKEN", keyringKey: "github.org" }] },
	"@theholocron/holocron-plugin-cloudflare": {
		tokens: [{ envName: "HOLOCRON_CLOUDFLARE_TOKEN", keyringKey: "cloudflare" }],
	},
};
const tokensImporter: AuthImporter = async (pkg) => {
	const found = TOKENS[pkg as keyof typeof TOKENS];
	if (!found) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
	return found;
};

/** The old `doctor credentials` report, built from the rows and places `credentialsRows()` gives. */
async function runDoctorCredentials(input: {
	loaded: LoadedConfig;
	context: { repoRoot: string };
	loader?: PluginLoader;
	importer?: AuthImporter;
	env?: Record<string, string | undefined>;
	gitExec?: () => Promise<string>;
	print?: (l: string) => void;
	logger?: unknown;
}) {
	const loader =
		input.loader ?? new PluginLoader(input.loaded.resolved, input.context, undefined, { readCredentials: false });
	await loader.load();
	const result = await credentialsRows({
		loaded: input.loaded,
		context: input.context,
		loader,
		...(input.importer ? { importer: input.importer } : {}),
		...(input.gitExec ? { gitExec: input.gitExec as never } : {}),
		wants: () => true,
		asked: true,
	});
	const rows: CheckRow[] = result.rows;
	const print = input.print ?? ((l: string) => console.log(l));
	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);
	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	return {
		status,
		rows,
		places: result.places,
		summary,
		reason: status === "skip" ? [...new Set(rows.map((r) => r.detail))].join("; ") : undefined,
	};
}

async function run(loaded: LoadedConfig, impl: Impl | null, importer = tokensImporter) {
	const lines: string[] = [];
	const report = await runDoctorCredentials({
		loaded,
		context: { repoRoot: "/tmp/test" },
		loader: loaderWith(loaded, impl),
		importer,
		print: (l) => lines.push(stripVTControlCharacters(l)),
	});
	return { report, lines };
}

const inspecting = (environment: string, ...names: string[]) => ({
	inspect: vi.fn(async () => ({ environment, names })),
});

describe("credentials rows", () => {
	it("prints one ok row that counts the tokens the plugins take, and ignores names they do not", async () => {
		const impl = inspecting("Demo", "HOLOCRON_ORG_TOKEN", "HOLOCRON_CLOUDFLARE_TOKEN", "EXTRA");
		const { report, lines } = await run(loadedWith(), impl);
		expect(report.status).toBe("ok");
		expect(report.rows.map((r) => [r.id, r.status, r.detail])).toEqual([
			["1password:tokens", "ok", '2 of 2 tokens present in "Demo"'],
		]);
		expect(lines).toEqual([
			'  ✓ 1password: tokens  2 of 2 tokens present in "Demo"',
			"",
			"1 ok, 0 fail, 0 skipped",
		]);
	});

	it("sorts by code unit, not by locale", async () => {
		const tokens: AuthImporter = async () => ({
			tokens: ["b_TOKEN", "A_TOKEN", "a_TOKEN", "B_TOKEN"].map((envName) => ({ envName, keyringKey: envName })),
		});
		const { report } = await run(loadedWith(), inspecting("Demo"), tokens);
		expect(report.rows.map((r) => r.id)).toEqual([
			"1password:A_TOKEN",
			"1password:B_TOKEN",
			"1password:a_TOKEN",
			"1password:b_TOKEN",
		]);
	});

	describe("a token a plugin only falls back to", () => {
		const withOptional: AuthImporter = async (pkg) =>
			pkg.endsWith("github")
				? {
						tokens: [
							{ envName: "HOLOCRON_ORG_TOKEN", keyringKey: "github.org" },
							{ envName: "HOLOCRON_FALLBACK_WEBHOOK", keyringKey: "fallback", optional: true },
						],
					}
				: tokensImporter(pkg);

		it("is a skipped row that says it is optional and not set", async () => {
			const { report, lines } = await run(
				loadedWith(),
				inspecting("Demo", "HOLOCRON_ORG_TOKEN", "HOLOCRON_CLOUDFLARE_TOKEN"),
				withOptional
			);
			expect(report.status).toBe("ok");
			expect(report.summary).toEqual({ ok: 1, fail: 0, skip: 1 });
			expect(report.rows[0]).toMatchObject({
				id: "1password:HOLOCRON_FALLBACK_WEBHOOK",
				status: "skip",
				detail: 'optional, not set in "Demo"',
			});
			expect(lines.at(-1)).toBe("1 ok, 0 fail, 1 skipped");
		});

		it("is an ok row when the environment has it", async () => {
			const { report } = await run(
				loadedWith(),
				inspecting("Demo", "HOLOCRON_ORG_TOKEN", "HOLOCRON_FALLBACK_WEBHOOK", "HOLOCRON_CLOUDFLARE_TOKEN"),
				withOptional
			);
			expect(report.summary).toEqual({ ok: 1, fail: 0, skip: 0 });
			expect(report.rows[0]?.detail).toBe('3 of 3 tokens present in "Demo"');
		});

		it("is expected after all when another plugin lists the same name as needed", async () => {
			const both: AuthImporter = async (pkg) =>
				pkg.endsWith("github")
					? { tokens: [{ envName: "HOLOCRON_SHARED", keyringKey: "a", optional: true }] }
					: { tokens: [{ envName: "HOLOCRON_SHARED", keyringKey: "a" }] };
			const { report } = await run(
				loadedWith({ providers: { credentials: ["1password"], source: "github", errors: "sentry" } }),
				inspecting("Demo", "SOMETHING_ELSE"),
				both
			);
			expect(report.status).toBe("fail");
			expect(report.rows).toHaveLength(1);
			expect(report.rows[0]).toMatchObject({ status: "fail", detail: 'missing from "Demo"' });
		});
	});

	it("fails a row for each variable the environment lacks", async () => {
		const { report, lines } = await run(loadedWith(), inspecting("Demo", "HOLOCRON_ORG_TOKEN"));
		expect(report.status).toBe("fail");
		expect(report.summary).toEqual({ ok: 1, fail: 1, skip: 0 });
		expect(lines[0]).toBe('  ✗ 1password: HOLOCRON_CLOUDFLARE_TOKEN  missing from "Demo"');
		expect(report.rows[1]).toMatchObject({ id: "1password:tokens", detail: '1 of 2 tokens present in "Demo"' });
	});

	it("says which spelling matched when it is not the one the config writes", async () => {
		const { report } = await run(
			loadedWith({ credentials: { environment: "demo" } }),
			inspecting("Demo", "HOLOCRON_ORG_TOKEN", "HOLOCRON_CLOUDFLARE_TOKEN")
		);
		expect(report.rows[0]?.detail).toBe('2 of 2 tokens present in "Demo" (the config writes "demo")');
	});

	it("fails once when the provider cannot find the environment", async () => {
		const impl = {
			inspect: vi.fn(async () => Promise.reject(new Error('1Password has no Environment named "Demo"'))),
		};
		const { report } = await run(loadedWith(), impl);
		expect(report.status).toBe("fail");
		expect(report.rows).toHaveLength(1);
		expect(report.rows[0]).toMatchObject({ id: "1password", status: "fail" });
		expect(report.rows[0]?.detail).toContain("has no Environment");
	});

	it("skips a provider that cannot list names without values", async () => {
		const { report } = await run(loadedWith(), {});
		expect(report.status).toBe("skip");
		expect(report.reason).toContain("without reading their values");
	});

	it("skips with one row when no plugin that can be loaded lists a token", async () => {
		const impl = inspecting("Demo");
		const { report } = await run(loadedWith(), impl, async () => {
			throw new Error("MODULE_NOT_FOUND");
		});
		expect(impl.inspect).not.toHaveBeenCalled();
		expect(report.rows).toEqual([
			{
				id: "1password",
				title: "1password",
				status: "skip",
				detail: "no configured plugin lists the tokens it takes",
				problems: [],
			},
		]);
	});

	it("fails a provider whose package did not load", async () => {
		const { report } = await run(loadedWith(), null);
		expect(report.status).toBe("fail");
		expect(report.rows[0]).toMatchObject({ id: "1password", status: "fail" });
		expect(report.rows[0]?.detail).toContain("failed to load");
	});

	it("skips when no credentials provider is configured", async () => {
		const loaded = loadedWith({ providers: { source: "github" }, credentials: undefined });
		const { report } = await run(loaded, null);
		expect(report.status).toBe("skip");
		expect(report.reason).toBe("no `credentials` provider is configured");
	});

	it("skips a loaded provider the config gives no environment", async () => {
		const loaded = loadedWith();
		const loader = {
			load: async () => {},
			loadedKeys: () => ["credentials"],
			loadFailures: () => [],
			has: () => true,
			get: () => [
				{
					key: "credentials",
					providerName: "stranger",
					inspect: async () => ({ environment: "x", names: [] }),
				},
			],
		} as unknown as PluginLoader;
		const lines: string[] = [];
		const report = await runDoctorCredentials({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			importer: tokensImporter,
			print: (l) => lines.push(l),
		});
		expect(report.status).toBe("skip");
		expect(report.reason).toBe("no `environment` option and `credentials.environment` is not set");
	});

	it("reads the environment a provider names itself, ahead of the shared one", async () => {
		const impl = inspecting("Own", "HOLOCRON_ORG_TOKEN", "HOLOCRON_CLOUDFLARE_TOKEN");
		const loaded = loadedWith({
			providers: { credentials: [["1password", { environment: "Own" }]], source: "github" },
		});
		const { report } = await run(loaded, impl);
		expect(impl.inspect).toHaveBeenCalledWith("Own");
		expect(report.status).toBe("ok");
	});

	it("takes a plugin that lists no tokens as expecting none", async () => {
		const { report } = await run(loadedWith(), inspecting("Demo", "A"), async () => ({}));
		expect(report.rows[0]?.status).toBe("skip");
	});

	it("prints to the console and loads the plugins' tokens itself when it is given neither", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const loaded = loadedWith();
			const report = await runDoctorCredentials({
				loaded,
				context: { repoRoot: "/tmp/test" },
				loader: loaderWith(loaded, inspecting("Demo")),
			});
			// The real plugins' tokens are expected here, so a stub environment with none of them fails: only the row matters.
			expect(report.rows[0]).toMatchObject({ id: "1password:HOLOCRON_ADMIN_TOKEN", status: "fail" });
			expect(log).toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});

	it("builds its own loader when it is given none, and runs no provider when none is configured", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const loaded = loadedWith({ providers: { source: "github" }, credentials: undefined });
			const report = await runDoctorCredentials({ loaded, context: { repoRoot: "/tmp/test" } });
			expect(report.reason).toBe("no `credentials` provider is configured");
		} finally {
			log.mockRestore();
		}
	});

	it("never reads a value: the loader it makes asks the provider for none", async () => {
		clearCredentials();
		const read = vi.fn(async () => ({ HOLOCRON_ORG_TOKEN: "secret" }));
		await run(loadedWith(), { ...inspecting("Demo", "HOLOCRON_ORG_TOKEN"), read });
		expect(read).not.toHaveBeenCalled();
		expect(getCredential("HOLOCRON_ORG_TOKEN")).toBeUndefined();
	});

	describe("with the Environment names derived (#2063)", () => {
		const SLUG = "theholocron/holocron";
		const gitExec = async () => "git@github.com:theholocron/holocron.git\n";
		const absent = Object.assign(new Error("not found"), { status: 404 });
		const derived = () => loadedWith({ credentials: undefined });
		const holding = (held: Record<string, string[]>) => ({
			inspect: vi.fn(async (environment: string) => {
				const names = held[environment];
				if (!names) throw absent;
				return { environment, names };
			}),
		});
		async function runDerived(held: Record<string, string[]>, env: Record<string, string> = {}) {
			const loaded = derived();
			const lines: string[] = [];
			const report = await runDoctorCredentials({
				loaded,
				context: { repoRoot: "/tmp/test" },
				loader: loaderWith(loaded, holding(held)),
				importer: tokensImporter,
				env,
				gitExec,
				print: (l) => lines.push(stripVTControlCharacters(l)),
			});
			return report;
		}
		const BOTH = ["HOLOCRON_ORG_TOKEN", "HOLOCRON_CLOUDFLARE_TOKEN"];

		it("finds a variable in local over dev and says which", async () => {
			const report = await runDerived({
				[`${SLUG} - local`]: ["HOLOCRON_ORG_TOKEN"],
				[`${SLUG} - dev`]: BOTH,
			});
			expect(report.status).toBe("ok");
			expect(report.rows.map((r) => r.detail)).toEqual([
				`2 of 2 tokens present in "${SLUG} - local", "${SLUG} - dev"`,
			]);
		});

		it("says nothing about a missing local", async () => {
			const report = await runDerived({ [`${SLUG} - dev`]: BOTH });
			expect(report.status).toBe("ok");
			expect(report.rows).toHaveLength(1);
		});

		it("reads the same two Environments whatever layer the process is in", async () => {
			const report = await runDerived({ [`${SLUG} - dev`]: BOTH }, { CI: "true", HOLOCRON_ENVIRONMENT: "ci" });
			expect(report.status).toBe("ok");
		});

		it("gives the matrix a place for each Environment found: what is held is expected, and a token neither holds is missing in dev", async () => {
			const report = await runDerived({
				[`${SLUG} - local`]: ["HOLOCRON_ORG_TOKEN", "LOCAL_ONLY"],
				[`${SLUG} - dev`]: ["HOLOCRON_ORG_TOKEN", "STRAY"],
			});
			expect(report.status).toBe("fail");
			const [local, dev] = report.places;
			expect(local).toMatchObject({
				column: { id: `vault:${SLUG} - local`, label: "local", env: "local" },
				needed: ["HOLOCRON_ORG_TOKEN"],
				present: ["HOLOCRON_ORG_TOKEN", "LOCAL_ONLY"],
			});
			expect(dev).toMatchObject({
				column: { label: "dev", env: "dev" },
				needed: ["HOLOCRON_ORG_TOKEN", "HOLOCRON_CLOUDFLARE_TOKEN"],
				present: ["HOLOCRON_ORG_TOKEN", "STRAY"],
			});
		});

		describe("when the provider says which names are visible", () => {
			const synced = {
				repo: { variables: { sync: [{ environment: `${SLUG} - ci`, keys: ["TURBO_TEAM", "SENTRY_ORG"] }] } },
			};
			const listing = (held: Record<string, { secrets: string[]; variables: string[] }>) => ({
				inspect: vi.fn(async (environment: string) => {
					const found = held[environment];
					if (!found) throw absent;
					return { environment, names: [...found.secrets, ...found.variables], visible: found.variables };
				}),
			});
			async function runListing(held: Parameters<typeof listing>[0]) {
				const loaded = loadedWith({ credentials: undefined, ...synced });
				return runDoctorCredentials({
					loaded,
					context: { repoRoot: "/tmp/test" },
					loader: loaderWith(loaded, listing(held)),
					importer: tokensImporter,
					gitExec,
				});
			}

			it("gives each Environment a place for its secrets and one for its variables, so neither block holds the other's names", async () => {
				const report = await runListing({
					[`${SLUG} - dev`]: { secrets: BOTH, variables: ["TURBO_TEAM", "SENTRY_ORG", "STRAY_VAR"] },
				});
				const secret = report.places.find((p) => p.kind === "secret")!;
				const variable = report.places.find((p) => p.kind === "variable")!;
				expect(secret.present).toEqual(BOTH);
				expect(variable.present).toEqual(["TURBO_TEAM", "SENTRY_ORG", "STRAY_VAR"]);
				expect(variable.column.id).toBe(secret.column.id);
			});

			it("expects dev to hold its own copy of each variable repo.variables.sync writes, and local to expect none", async () => {
				const report = await runListing({
					[`${SLUG} - local`]: { secrets: [], variables: ["LOCAL_VAR"] },
					[`${SLUG} - dev`]: { secrets: BOTH, variables: ["TURBO_TEAM"] },
				});
				const [local, dev] = report.places.filter((p) => p.kind === "variable");
				expect(local).toMatchObject({ needed: [], present: ["LOCAL_VAR"] });
				expect(dev).toMatchObject({ needed: ["TURBO_TEAM", "SENTRY_ORG"], present: ["TURBO_TEAM"] });
				expect(dev!.reasons?.SENTRY_ORG).toContain("repo.variables.sync");
			});

			it("counts a visible token as present, since it is there", async () => {
				const report = await runListing({
					[`${SLUG} - dev`]: { secrets: ["HOLOCRON_ORG_TOKEN"], variables: ["HOLOCRON_CLOUDFLARE_TOKEN"] },
				});
				expect(report.status).toBe("ok");
			});
		});

		it("gives the matrix an unreadable place for a missing dev, and none for a missing local", async () => {
			const report = await runDerived({});
			expect(report.places).toHaveLength(1);
			expect(report.places[0]).toMatchObject({
				column: { label: "dev", env: "dev" },
				unread: `1password has no Environment named "${SLUG} - dev"`,
			});
		});

		it("reports a missing dev by name and reads nothing else", async () => {
			const impl = holding({});
			const loaded = derived();
			const report = await runDoctorCredentials({
				loaded,
				context: { repoRoot: "/tmp/test" },
				loader: loaderWith(loaded, impl),
				importer: tokensImporter,
				env: {},
				gitExec,
				print: () => {},
			});
			expect(report.status).toBe("fail");
			expect(report.rows.map((r) => r.detail)).toEqual([`1password has no Environment named "${SLUG} - dev"`]);
			expect(impl.inspect.mock.calls.map(([name]) => name)).toEqual([`${SLUG} - local`, `${SLUG} - dev`]);
		});

		it("fails once, naming the option, when the remote cannot be parsed", async () => {
			const loaded = derived();
			const report = await runDoctorCredentials({
				loaded,
				context: { repoRoot: "/tmp/test" },
				loader: loaderWith(loaded, holding({})),
				importer: tokensImporter,
				env: {},
				gitExec: async () => "/not/a/remote",
				print: () => {},
			});
			expect(report.rows[0]).toMatchObject({ status: "fail" });
			expect(report.rows[0]?.detail).toMatch(/`environment` option/);
		});
	});
});
