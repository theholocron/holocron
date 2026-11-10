import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { MissingTokenError, type PluginImporter, PluginLoader, type SecretScope } from "../../plugin/index.js";
import { runDoctorVariableOwners } from "./doctor-variable-owners.js";

type Raw = Parameters<typeof resolveConfig>[0];

/** A value that must never reach the output. */
const VALUE = "s3cret-value-do-not-print";

const loadedWith = (extra: Record<string, unknown> = {}): LoadedConfig => ({
	resolved: resolveConfig({
		name: "demo",
		providers: { credentials: ["1password"], secrets: "github", source: "github" },
		credentials: { environment: "Holocron" },
		...extra,
	} as Raw),
	filepath: "/tmp/test/holocron.config.json",
});

/** What the fake world holds. A key that is absent is a place that cannot be read. */
interface World {
	/** Environment name to the names it holds, or an error message. */
	environments?: Record<string, string[] | Error>;
	/** `repo`, `org` or `env:<name>` to the secret names, or an error. */
	secrets?: Record<string, string[] | Error>;
	/** `repo` or `org` to the variable names (the fake gives each a value), or an error. */
	variables?: Record<string, string[] | Error>;
	/** The credentials provider cannot list names. */
	noInspect?: boolean;
	/** The `source` provider cannot list variables. */
	noListVariables?: boolean;
}

const scopeKey = (scope: SecretScope): string =>
	scope.kind === "repo" ? "repo" : scope.kind === "organization" ? "org" : `env:${scope.name}`;

const valued = (names: string[]): Record<string, string> => Object.fromEntries(names.map((n) => [n, VALUE]));

function loaderWith(loaded: LoadedConfig, world: World, withCredentials = true): PluginLoader {
	const answer = <T>(
		table: Record<string, string[] | Error> | undefined,
		key: string,
		make: (names: string[]) => T
	): T => {
		const found = table?.[key];
		if (found === undefined) throw new Error(`no ${key}`);
		if (found instanceof Error) throw found;
		return make(found);
	};
	const importer = vi.fn(async (pkg: string) => {
		if (pkg === "@theholocron/holocron-plugin-1password" && withCredentials) {
			return {
				createPlugin: () => ({
					name: "1password",
					capabilities: {
						credentials: () => ({
							key: "credentials",
							providerName: "1password",
							read: async () => ({ LEAK: VALUE }),
							...(world.noInspect
								? {}
								: {
										inspect: async (environment: string) =>
											answer(world.environments, environment, (names) => ({
												environment,
												names,
											})),
									}),
						}),
					},
				}),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		if (pkg === "@theholocron/holocron-plugin-github") {
			return {
				createPlugin: () => ({
					name: "github",
					capabilities: {
						secrets: () => ({
							providerName: "github",
							listSecrets: async (scope: SecretScope) => answer(world.secrets, scopeKey(scope), (n) => n),
						}),
						source: () => ({
							providerName: "github",
							...(world.noListVariables
								? {}
								: {
										listVariables: async () => answer(world.variables, "repo", valued),
										listOrgVariables: async () => answer(world.variables, "org", valued),
									}),
						}),
					},
				}),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter, {
		readCredentials: false,
	});
}

async function run(loaded: LoadedConfig, world: World, opts: { org?: string; credentials?: boolean } = {}) {
	const lines: string[] = [];
	const report = await runDoctorVariableOwners({
		loaded,
		context: {
			repoRoot: "/tmp/test",
			...("org" in opts ? {} : { org: "acme" }),
			...(opts.org ? { org: opts.org } : {}),
		},
		loader: loaderWith(loaded, world, opts.credentials ?? true),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
	});
	return { report, lines };
}

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

describe("doctor variable-owners — findings", () => {
	it("fails for a name two Environments hold, naming both and no value", async () => {
		const { report, lines } = await run(
			loadedWith({ repo: { variables: { sync: [{ environment: "Other", keys: ["X"] }] } } }),
			{
				environments: { Holocron: ["SHARED", "ONLY_HERE"], Other: ["SHARED"] },
				secrets: { repo: [], org: [] },
				variables: { repo: [], org: [] },
			}
		);
		const row = report.rows.find((r) => r.id === "owners:SHARED")!;
		expect(row.status).toBe("fail");
		expect(row.problems).toEqual(['held by Environment "Holocron"', 'held by Environment "Other"']);
		expect(report.status).toBe("fail");
		expect(ids(report.rows)).not.toContain("owners");
		expect(lines.join("\n")).not.toContain(VALUE);
	});

	it("fails for a name in an Environment and a GitHub secret that no sync entry fills", async () => {
		const { report } = await run(loadedWith(), {
			environments: { Holocron: ["A"] },
			secrets: { repo: ["a"], org: [] },
			variables: { repo: [], org: [] },
		});
		const row = report.rows.find((r) => r.id === "owners:A")!;
		expect(row.problems).toEqual(['held by Environment "Holocron"', "held by repository secrets"]);
	});

	it("compares a name and a repository variable of the same name", async () => {
		const { report } = await run(loadedWith(), {
			environments: { Holocron: ["V"] },
			secrets: { repo: [], org: [] },
			variables: { repo: ["V"], org: ["V"] },
		});
		expect(report.rows.find((r) => r.id === "owners:V")!.problems).toEqual([
			'held by Environment "Holocron"',
			"held by repository variables",
			"held by organization variables",
		]);
	});

	it("reads an environment's secrets when a sync entry or repo.secrets.environments names it", async () => {
		const { report } = await run(
			loadedWith({
				repo: {
					secrets: {
						environments: { prod: [] },
						sync: [{ environment: "Holocron - GitHub Actions", keys: ["K"], scope: "env=staging" }],
					},
				},
			}),
			{
				environments: { Holocron: ["P"], "Holocron - GitHub Actions": ["K"] },
				secrets: { repo: [], org: [], "env:prod": ["P"], "env:staging": ["K"] },
				variables: { repo: [], org: [] },
			}
		);
		expect(report.rows.find((r) => r.id === "owners:P")!.problems).toEqual([
			'held by Environment "Holocron"',
			"held by prod environment secrets",
		]);
		expect(ids(report.rows)).not.toContain("owners:K");
	});
});

describe("doctor variable-owners — what is not a finding", () => {
	const fanned = (extra: Record<string, unknown> = {}) =>
		loadedWith({
			repo: {
				secrets: {
					sync: [
						{ environment: "Gha", scope: "org=acme", keys: ["ORG_ONE"] },
						{ environment: "Gha", keys: ["REPO_ONE"] },
						{ environment: "Gha", scope: "env=prod" },
						{ environment: "Gha", scope: "bad scope" },
					],
				},
				variables: { sync: [{ environment: "Vars", scope: "org=acme", keys: ["VAR_ONE"] }] },
			},
			...extra,
		});

	it("does not report the copy a sync entry makes", async () => {
		const { report } = await run(fanned(), {
			environments: { Holocron: [], Gha: ["ORG_ONE", "REPO_ONE", "ENV_ONE"], Vars: ["VAR_ONE"] },
			secrets: { repo: ["REPO_ONE"], org: ["ORG_ONE"], "env:prod": ["ENV_ONE"] },
			variables: { repo: [], org: ["VAR_ONE"] },
		});
		expect(report.status).toBe("ok");
		expect(report.rows.filter((r) => r.status === "fail")).toEqual([]);
	});

	it("reports a name the sync entry does not list", async () => {
		const { report } = await run(fanned(), {
			environments: { Holocron: [], Gha: ["ORG_ONE", "OTHER"], Vars: [] },
			secrets: { repo: ["OTHER"], org: ["ORG_ONE"], "env:prod": [] },
			variables: { repo: [], org: [] },
		});
		expect(ids(report.rows.filter((r) => r.status === "fail"))).toEqual(["owners:OTHER"]);
	});

	it("reports a second Environment holding a name a sync entry fills", async () => {
		const { report } = await run(fanned(), {
			environments: { Holocron: ["ORG_ONE"], Gha: ["ORG_ONE"], Vars: [] },
			secrets: { repo: [], org: ["ORG_ONE"], "env:prod": [] },
			variables: { repo: [], org: [] },
		});
		expect(report.rows.find((r) => r.id === "owners:ORG_ONE")!.problems).toEqual([
			'held by Environment "Holocron"',
			'held by Environment "Gha"',
		]);
	});

	it("does not report a name listed in doctor.sharedVariables, in any letter case", async () => {
		const { report } = await run(loadedWith({ doctor: { sharedVariables: ["shared_one"] } }), {
			environments: { Holocron: ["SHARED_ONE"] },
			secrets: { repo: ["SHARED_ONE"], org: [] },
			variables: { repo: [], org: [] },
		});
		expect(report.status).toBe("ok");
		expect(ids(report.rows)).toEqual(["owners"]);
	});

	it("treats the Environments of the registered GitHub App instances as one place", async () => {
		const { report } = await run(
			loadedWith({
				githubApps: [
					{ name: "Sentinel", manifest: "m.json", environment: "Sentinel" },
					{ name: "Sentinel - dev", manifest: "m.json", environment: "Sentinel - dev" },
				],
			}),
			{
				environments: {
					Holocron: [],
					Sentinel: ["SENTINEL_WEBHOOK_SECRET"],
					"Sentinel - dev": ["SENTINEL_WEBHOOK_SECRET"],
				},
				secrets: { repo: [], org: [] },
				variables: { repo: [], org: [] },
			}
		);
		expect(report.status).toBe("ok");
	});

	it("still reports an App instance's name held by another Environment", async () => {
		const { report } = await run(
			loadedWith({ githubApps: [{ name: "Sentinel", manifest: "m.json", environment: "Sentinel" }] }),
			{
				environments: { Holocron: ["APP_ID"], Sentinel: ["APP_ID"] },
				secrets: { repo: [], org: [] },
				variables: { repo: [], org: [] },
			}
		);
		expect(ids(report.rows.filter((r) => r.status === "fail"))).toEqual(["owners:APP_ID"]);
	});

	it("reads the Environments of dev and a provider's own environment option", async () => {
		const { report } = await run(
			loadedWith({
				providers: {
					credentials: [["1password", { environment: "Own" }]],
					secrets: "github",
					source: "github",
				},
				dev: { environment: "Dev", command: ["x"] },
			}),
			{
				environments: { Holocron: [], Own: ["N"], Dev: ["N"] },
				secrets: { repo: [], org: [] },
				variables: { repo: [], org: [] },
			}
		);
		expect(report.rows.find((r) => r.id === "owners:N")!.problems).toEqual([
			'held by Environment "Own"',
			'held by Environment "Dev"',
		]);
	});
});

describe("doctor variable-owners — ordering and spelling", () => {
	it("lists the findings in name order, and counts a name once per place whatever its letter case", async () => {
		const { report } = await run(loadedWith(), {
			environments: { Holocron: ["ZED", "alpha", "ALPHA", "MID"] },
			secrets: { repo: ["MID", "ALPHA", "ZED"], org: [] },
			variables: { repo: [], org: [] },
		});
		expect(ids(report.rows.filter((r) => r.status === "fail"))).toEqual([
			"owners:alpha",
			"owners:MID",
			"owners:ZED",
		]);
		expect(report.rows.find((r) => r.id === "owners:alpha")!.problems).toEqual([
			'held by Environment "Holocron"',
			"held by repository secrets",
		]);
	});
});

describe("doctor variable-owners — prefixed pairs", () => {
	it("reports a bare name beside its prefixed one as info, not a failure", async () => {
		const { report, lines } = await run(loadedWith(), {
			environments: {
				Holocron: ["TURBO_TEAM", "HOLOCRON_TURBO_TEAM", "APP_ID", "SENTINEL_APP_ID", "X", "COMLINK_X"],
			},
			secrets: { repo: [], org: [] },
			variables: { repo: [], org: [] },
		});
		const pairs = report.rows.filter((r) => r.id.startsWith("pair:"));
		expect(pairs.map((r) => [r.id, r.status, r.title])).toEqual([
			["pair:APP_ID", "skip", "APP_ID and SENTINEL_APP_ID"],
			["pair:TURBO_TEAM", "skip", "TURBO_TEAM and HOLOCRON_TURBO_TEAM"],
			["pair:X", "skip", "X and COMLINK_X"],
		]);
		expect(pairs[0]!.detail).toMatch(/^info: both exist/);
		expect(report.status).toBe("ok");
		expect(lines.at(-1)).toBe("1 ok, 0 fail, 3 skipped");
	});

	it("finds a pair across two places", async () => {
		const { report } = await run(loadedWith(), {
			environments: { Holocron: ["Y"] },
			secrets: { repo: ["HOLOCRON_Y"], org: [] },
			variables: { repo: [], org: [] },
		});
		expect(report.rows.find((r) => r.id === "pair:Y")!.detail).toContain(
			'Y in Environment "Holocron"; HOLOCRON_Y in repository secrets'
		);
	});
});

describe("doctor variable-owners — places that cannot be read", () => {
	it("skips an Environment the provider cannot find, with the reason", async () => {
		const { report } = await run(loadedWith({ dev: { environment: "Gone", command: ["x"] } }), {
			environments: { Holocron: ["A"], Gone: new Error("Environment not found") },
			secrets: { repo: [], org: [] },
			variables: { repo: [], org: [] },
		});
		const row = report.rows.find((r) => r.id === "skip:env:Gone")!;
		expect(row.status).toBe("skip");
		expect(row.detail).toContain("could not read it with 1password");
		expect(row.detail).toContain("Environment not found");
		expect(report.status).toBe("ok");
	});

	it("says no credentials provider is configured, for each Environment the config names", async () => {
		const loaded = loadedWith({
			providers: { secrets: "github", source: "github" },
			githubApps: [{ name: "S", manifest: "m.json", environment: "Sentinel" }],
		});
		const { report } = await run(
			loaded,
			{ secrets: { repo: [], org: [] }, variables: { repo: [], org: [] } },
			{ credentials: false }
		);
		expect(report.rows.find((r) => r.id === "skip:env:Sentinel")!.detail).toBe(
			"no `credentials` provider is configured"
		);
	});

	it("skips an Environment when the provider cannot list names without values", async () => {
		const { report } = await run(loadedWith(), {
			noInspect: true,
			secrets: { repo: [], org: [] },
			variables: { repo: [], org: [] },
		});
		expect(report.rows.find((r) => r.id === "skip:env:Holocron")!.detail).toBe(
			"no `credentials` provider can list names without reading values"
		);
	});

	it("skips a GitHub scope whose token is missing, and still compares the rest", async () => {
		const { report } = await run(loadedWith(), {
			environments: { Holocron: ["A"] },
			secrets: { repo: ["A"], org: new MissingTokenError("no HOLOCRON_SECRETS_TOKEN") },
			variables: { repo: [], org: [] },
		});
		expect(report.rows.find((r) => r.id === "skip:org-secrets")).toMatchObject({
			status: "skip",
			detail: expect.stringContaining("HOLOCRON_SECRETS_TOKEN"),
		});
		expect(ids(report.rows.filter((r) => r.status === "fail"))).toEqual(["owners:A"]);
	});

	it("skips a scope that fails for another reason, never failing the check", async () => {
		const { report } = await run(loadedWith(), {
			environments: { Holocron: ["A"] },
			secrets: { repo: new Error("HTTP 403"), org: [] },
			variables: { repo: new Error("HTTP 500"), org: [] },
		});
		expect(report.rows.find((r) => r.id === "skip:repo-secrets")!.detail).toContain("HTTP 403");
		expect(report.rows.find((r) => r.id === "skip:repo-variables")!.detail).toContain("HTTP 500");
		expect(report.status).toBe("ok");
	});

	it("skips the organization rows when there is no organization", async () => {
		const { report } = await run(
			loadedWith(),
			{ environments: { Holocron: [] }, secrets: { repo: [] }, variables: { repo: [] } },
			{ org: "" }
		);
		expect(report.rows.find((r) => r.id === "skip:org-secrets")!.detail).toContain("no organization");
		expect(report.rows.find((r) => r.id === "skip:org-variables")!.detail).toContain("no organization");
	});

	it("takes the organization from the repository name", async () => {
		const loaded = loadedWith();
		const lines: string[] = [];
		const report = await runDoctorVariableOwners({
			loaded,
			context: { repoRoot: "/tmp/test", repo: "acme/demo" },
			loader: loaderWith(loaded, {
				environments: { Holocron: [] },
				secrets: { repo: [], org: [] },
				variables: { repo: [], org: [] },
			}),
			print: (l) => lines.push(l),
			logger: fakeLogger(),
		});
		expect(ids(report.rows)).not.toContain("skip:org-secrets");
	});

	it("skips variables when the source provider cannot list them", async () => {
		const { report } = await run(loadedWith(), {
			environments: { Holocron: [] },
			noListVariables: true,
			secrets: { repo: [], org: [] },
		});
		expect(report.rows.find((r) => r.id === "skip:repo-variables")!.detail).toBe(
			"the `source` provider cannot list variables"
		);
		expect(report.rows.find((r) => r.id === "skip:org-variables")!.detail).toBe(
			"the `source` provider cannot list organization variables"
		);
	});

	it("skips GitHub when there is no secrets or source provider", async () => {
		const { report } = await run(loadedWith({ providers: { credentials: ["1password"] } }), {
			environments: { Holocron: ["A"] },
		});
		expect(report.rows.find((r) => r.id === "skip:repo-secrets")!.detail).toContain("no `secrets` provider");
		expect(report.rows.find((r) => r.id === "skip:repo-variables")!.detail).toContain("no `source` provider");
		expect(report.status).toBe("ok");
	});

	it("is a skip, with the reasons, when nothing could be read", async () => {
		const { report, lines } = await run(loadedWith({ providers: {} }), {}, { credentials: false });
		expect(report.status).toBe("skip");
		expect(report.reason).toContain("no `secrets` provider");
		expect(lines.at(-1)).toMatch(/^0 ok, 0 fail, \d+ skipped$/);
	});

	it("names a credentials provider that failed to load", async () => {
		const loaded = loadedWith({ providers: { credentials: ["1password"], secrets: "github", source: "github" } });
		const lines: string[] = [];
		const importer = async (pkg: string) => {
			if (pkg === "@theholocron/holocron-plugin-1password") throw new Error("boom");
			return {
				createPlugin: () => ({
					name: "github",
					capabilities: { secrets: () => ({ listSecrets: async () => [] }), source: () => ({}) },
				}),
			} as never;
		};
		const loader = new PluginLoader(
			loaded.resolved,
			{ repoRoot: "/tmp/test" },
			importer as unknown as PluginImporter,
			{
				readCredentials: false,
			}
		);
		const report = await runDoctorVariableOwners({
			loaded,
			context: { repoRoot: "/tmp/test", org: "acme" },
			loader,
			print: (l) => lines.push(l),
			logger: fakeLogger(),
		});
		expect(report.rows.find((r) => r.id === "skip:env:Holocron")!.detail).toBe(
			"a `credentials` provider failed to load (1password)"
		);
	});
});

describe("doctor variable-owners — defaults", () => {
	it("prints to the console and logs through the command logger when none is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const loaded = loadedWith();
		const report = await runDoctorVariableOwners({
			loaded,
			context: { repoRoot: "/tmp/test", org: "acme" },
			loader: loaderWith(loaded, {
				environments: { Holocron: ["A"] },
				secrets: { repo: [], org: [] },
				variables: { repo: [], org: [] },
			}),
		});
		expect(report.status).toBe("ok");
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});
});

describe("doctor variable-owners — no findings", () => {
	it("is all ok, with the counts, and never prints a value", async () => {
		const { report, lines } = await run(loadedWith(), {
			environments: { Holocron: ["A", "B"] },
			secrets: { repo: ["C"], org: [] },
			variables: { repo: ["D"], org: ["E"] },
		});
		expect(report.status).toBe("ok");
		expect(report.rows).toEqual([
			{
				id: "owners",
				title: "no variable lives in more than one place",
				status: "ok",
				detail: "5 name(s) across 5 place(s) read",
				problems: [],
			},
		]);
		expect(lines.join("\n")).not.toContain(VALUE);
		expect(JSON.stringify(report)).not.toContain(VALUE);
		expect(lines.at(-1)).toBe("1 ok, 0 fail, 0 skipped");
	});

	it("never prints a value when a finding is reported either", async () => {
		const { report, lines } = await run(loadedWith(), {
			environments: { Holocron: ["D"] },
			secrets: { repo: [], org: [] },
			variables: { repo: ["D"], org: [] },
		});
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).not.toContain(VALUE);
		expect(JSON.stringify(report)).not.toContain(VALUE);
	});
});
