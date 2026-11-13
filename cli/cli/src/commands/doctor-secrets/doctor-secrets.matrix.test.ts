import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/index.js";
import { MissingTokenError, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runDoctorSecrets } from "./doctor-secrets.js";
import type { DoctorEnvironment } from "./doctor-secrets.type.js";

type Raw = Parameters<typeof resolveConfig>[0];

interface Fakes {
	/** The secrets GitHub holds, by scope kind. */
	held?: Record<string, string[]>;
	/** The vault Environments, by name; a string is the error `readEnvironment` throws. */
	vault?: Record<string, Record<string, string> | string> | null;
	/** The vault provider's name. Defaults to 1password. */
	provider?: string;
	/** The names each credentials Environment holds, by Environment name; the plugins take HOLOCRON_ORG_TOKEN and HOLOCRON_ADMIN. */
	credentials?: Record<string, string[]>;
	/** The vault provider cannot read an Environment. */
	cannotRead?: boolean;
	/** The run knows no organization. */
	noOrg?: boolean;
	/** Leave out the `secrets` provider. */
	noSecrets?: boolean;
	/** What the repository's Actions variables hold. */
	variables?: Record<string, string>;
	/** What the organization's Actions variables hold. */
	orgVariables?: Record<string, { value: string; visibility: string }>;
}

async function run(
	config: Record<string, unknown>,
	fakes: Fakes = {},
	extra: {
		environments?: DoctorEnvironment[];
		only?: "secrets" | "variables";
		strict?: boolean;
		name?: string;
		width?: number;
	} = {}
) {
	const resolved = resolveConfig({
		name: "demo",
		providers: {
			secrets: "github",
			source: "github",
			...(fakes.vault === null ? {} : { vault: "1password" }),
			...(fakes.credentials ? { credentials: ["1password"] } : {}),
		},
		...config,
	} as unknown as Raw);
	const readEnvironment = vi.fn(async (id: string) => {
		const env = fakes.vault?.[id];
		if (env === undefined) throw new Error(`no Environment ${id}`);
		if (typeof env === "string") throw new MissingTokenError(env);
		return env;
	});
	const importer = vi.fn(async (pkg: string) => {
		if (pkg === "@theholocron/holocron-plugin-github" && !fakes.noSecrets) {
			return {
				createPlugin: () => ({
					name: "gh",
					capabilities: {
						secrets: () => ({
							providerName: "github",
							listSecrets: async (scope: { kind: string }) => fakes.held?.[scope.kind] ?? [],
						}),
						source: () => ({
							providerName: "github",
							listVariables: async () => fakes.variables ?? {},
							listOrgVariables: async () => fakes.orgVariables ?? {},
						}),
					},
				}),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		if (pkg === "@theholocron/holocron-plugin-1password" && fakes.vault !== null) {
			return {
				createPlugin: () => ({
					name: "op",
					capabilities: {
						credentials: () => ({
							key: "credentials",
							providerName: "1password",
							inspect: async (environment: string) => {
								const names = fakes.credentials?.[environment];
								if (!names) throw Object.assign(new Error("not found"), { status: 404 });
								return { environment, names };
							},
						}),
						vault: () => ({
							providerName: fakes.provider ?? "1password",
							...(fakes.cannotRead ? {} : { readEnvironment }),
						}),
					},
				}),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
	});
	const loaded = { resolved, filepath: "/tmp/test/holocron.config.json" };
	const lines: string[] = [];
	const report = await runDoctorSecrets({
		loaded,
		context: { repoRoot: "/tmp/test", ...(fakes.noOrg ? {} : { org: "acme" }) },
		loader: new PluginLoader(resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter),
		credentialsLoader: new PluginLoader(
			resolved,
			{ repoRoot: "/tmp/test" },
			importer as unknown as PluginImporter,
			{ readCredentials: false }
		),
		importer: async (pkg) => (pkg.endsWith("github") ? { tokens: TOKENS } : {}),
		gitExec: async () => "git@github.com:acme/demo.git\n",
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
		width: 200,
		...extra,
	});
	return { report, lines, readEnvironment };
}

const TOKENS = [
	{ envName: "HOLOCRON_ORG_TOKEN", keyringKey: "github.org" },
	{ envName: "HOLOCRON_ADMIN", keyringKey: "github.admin" },
];
const CI = "acme/demo - ci";
const PROD = "acme/demo - prod";
const repo = {
	secrets: {
		repo: ["HAND_SET"],
		sync: [{ environment: CI, keys: ["TOKEN_A", "TOKEN_B"] }],
		deploy: [{ environment: PROD, prefix: "APP_" }],
	},
};
const vault = {
	[CI]: { TOKEN_A: "x", TOKEN_B: "y", LEFTOVER: "z" },
	[PROD]: { APP_ONE: "x", ADMIN: "y" },
};

describe("doctor secrets — the matrix", () => {
	it("prints a row per name and a column per place, then the legend, names only", async () => {
		const { lines, report } = await run({ repo }, { vault, held: { repo: ["TOKEN_A", "HAND_SET", "STRAY"] } });
		const text = lines.join("\n");
		expect(text).toContain("Secrets");
		expect(text).toMatch(/name\s+1Password ci\s+1Password prod\s+GitHub repo\s+Deploy prod/);
		expect(text).toMatch(/TOKEN_A\s+ok\s+n\/a\s+ok\s+\?/);
		expect(text).toMatch(/TOKEN_B\s+ok\s+n\/a\s+MISSING\s+\?/);
		expect(text).toMatch(/LEFTOVER\s+extra\s+n\/a\s+n\/a\s+\?/);
		expect(text).toMatch(/APP_ONE\s+n\/a\s+ok\s+n\/a\s+\?/);
		expect(text).toMatch(/ADMIN\s+n\/a\s+extra/);
		expect(text).toContain("MISSING  needed here, not found");
		expect(text).not.toMatch(/"x"|"y"|"z"/);
		// The failing row is the existing GitHub one; the matrix adds the advisory extras as skipped rows.
		expect(report.rows.find((r) => r.id === "repo-secrets")).toMatchObject({ status: "fail" });
		expect(report.rows.filter((r) => r.id.startsWith("extra:")).every((r) => r.status === "skip")).toBe(true);
		expect(report.status).toBe("fail");
	});

	it("shows an extra GitHub name as info and exits ok, and a failure with --strict", async () => {
		const held = { repo: ["TOKEN_A", "TOKEN_B", "HAND_SET", "STRAY"] };
		const soft = await run({ repo }, { vault, held });
		expect(soft.report.status).toBe("ok");
		expect(soft.report.rows.find((r) => r.id === "extra:secret:github:repo")).toMatchObject({
			status: "skip",
			detail: "info: 1 extra in GitHub repo, nothing feeds it: STRAY",
		});
		const strict = await run({ repo }, { vault, held }, { strict: true });
		expect(strict.report.status).toBe("fail");
	});

	it("never reports a name in doctor.manualSecrets as extra", async () => {
		const held = { repo: ["TOKEN_A", "TOKEN_B", "HAND_SET", "LIGHTHOUSE"] };
		const config = { repo, doctor: { manualSecrets: ["LIGHTHOUSE"] } };
		const { report } = await run(config, { vault, held });
		expect(report.rows.some((r) => r.id === "extra:secret:github:repo")).toBe(false);
	});

	it("does not call an organization's other secrets extra", async () => {
		const config = {
			repo: { secrets: { sync: [{ environment: CI, keys: ["TOKEN_A"], scope: "org=acme", repos: ["demo"] }] } },
		};
		const { report } = await run(config, { vault, held: { organization: ["TOKEN_A", "SOMEONE_ELSES"] } });
		expect(report.rows.some((r) => r.id.startsWith("extra:secret:github:organization"))).toBe(false);
	});

	it("shows a place that could not be read as ?, with a skipped row that names it and why", async () => {
		const { report, lines } = await run({ repo }, { vault: { [CI]: "the vault is locked", [PROD]: vault[PROD] } });
		expect(lines.join("\n")).toMatch(/TOKEN_A\s+\?/);
		expect(report.rows.find((r) => r.id === "sync-" + CI)).toBeUndefined();
		expect(report.rows.find((r) => r.id === "unread:secret:deploy:" + PROD)).toMatchObject({
			status: "skip",
			detail: expect.stringContaining("not in the config"),
		});
	});

	it("reads each vault Environment once", async () => {
		const { readEnvironment } = await run({ repo }, { vault });
		expect(readEnvironment.mock.calls.filter(([id]) => id === PROD)).toHaveLength(1);
	});

	it("shows a vault that cannot list an Environment as ?", async () => {
		const { lines } = await run({ repo }, { vault, cannotRead: true });
		expect(lines.join("\n")).toMatch(/TOKEN_A\s+\?/);
	});

	it("needs no provider to say an organization secret has no organization to be looked up in", async () => {
		const config = { repo: { secrets: { org: ["NPM_TOKEN"] } } };
		const { report } = await run(config, { noSecrets: true, noOrg: true });
		expect(report.rows.find((r) => r.id === "org-secrets")).toMatchObject({ status: "skip" });
	});

	it("names a column for another vault provider after it", async () => {
		const { lines } = await run({ repo }, { vault, provider: "doppler" });
		expect(lines.join("\n")).toMatch(/Vault doppler ci/);
	});

	it("shows every GitHub place as ? with the reason when there is no secrets provider", async () => {
		const { lines, report } = await run({ repo }, { vault, noSecrets: true });
		expect(lines.join("\n")).toMatch(/TOKEN_A\s+ok\s+n\/a\s+\?\s+\?/);
		expect(report.rows.find((r) => r.id === "repo-secrets")).toMatchObject({ status: "skip" });
	});

	it("names the vault's place with the provider when it is not 1Password and says why when there is none", async () => {
		const none = await run({ repo }, { vault: null });
		expect(none.lines.join("\n")).toMatch(/Vault ci/);
	});
});

describe("doctor secrets — variables in the matrix", () => {
	const variables = {
		variables: { repo: { TURBO_TEAM: "acme" }, sync: [{ environment: "acme/demo - vars", keys: ["ACCOUNT"] }] },
	};

	it("puts variables in their own block after the secrets, with GitHub's repository variables", async () => {
		const { lines, report } = await run(
			{ repo: { ...variables } },
			{
				vault: { "acme/demo - vars": { ACCOUNT: "1" } },
				variables: { TURBO_TEAM: "acme", ACCOUNT: "1", OTHER: "x" },
			}
		);
		const text = lines.join("\n");
		expect(text.indexOf("Secrets")).toBeLessThan(text.indexOf("Variables"));
		expect(text).toMatch(/name\s+1Password acme\/demo - vars\s+GitHub repo/);
		expect(text).toMatch(/ACCOUNT\s+ok\s+ok/);
		expect(text).toMatch(/OTHER\s+n\/a\s+extra/);
		expect(report.rows.find((r) => r.id === "repo-variables")).toMatchObject({ status: "ok" });
	});

	it("shows only one block with --only-secrets and --only-variables, and runs only that side", async () => {
		const fakes = { vault: { ...vault, "acme/demo - vars": { ACCOUNT: "1" } } };
		const config = { repo: { ...repo, ...variables } };
		const secrets = await run(config, fakes, { only: "secrets" });
		expect(secrets.lines).not.toContain("Variables");
		expect(secrets.report.rows.some((r) => r.id === "repo-variables")).toBe(false);
		const vars = await run(config, fakes, { only: "variables" });
		expect(vars.lines).not.toContain("Secrets");
		expect(vars.report.rows.some((r) => r.id === "repo-secrets")).toBe(false);
		expect(vars.report.rows.some((r) => r.id.startsWith("deploy-"))).toBe(false);
	});

	it("shows an organization's variables only for the names this config feeds", async () => {
		const config = { repo: { variables: { org: { TURBO_TEAM: "acme" } } } };
		const { lines } = await run(config, {
			orgVariables: {
				TURBO_TEAM: { value: "acme", visibility: "all" },
				FOREIGN: { value: "1", visibility: "all" },
			},
		});
		const text = lines.join("\n");
		expect(text).toMatch(/TURBO_TEAM\s+ok/);
		expect(text).not.toContain("FOREIGN");
	});
});

describe("doctor secrets — --name", () => {
	it("says how each place stands and why, exits ok and prints no matrix", async () => {
		const { report, lines } = await run({ repo }, { vault, held: { repo: ["HAND_SET"] } }, { name: "token_a" });
		expect(report.status).toBe("ok");
		expect(lines).toContain(
			"1Password ci (secrets): ok, read by entry 1 of repo.secrets.sync, which writes it to repository secrets"
		);
		expect(lines).toContain(
			"GitHub repo (secrets): MISSING, synced to repository secrets by entry 1 of repo.secrets.sync (from acme/demo - ci)"
		);
		expect(lines.some((l) => l.startsWith("Legend"))).toBe(false);
	});

	it("says when no environment was read", async () => {
		const { lines } = await run({ repo }, {}, { name: "X", environments: ["test"] });
		expect(lines).toEqual(["X: no environment was read"]);
	});
});

describe("doctor secrets — environments in the matrix", () => {
	it("leaves the production column and the deployments out of --env ci, and the GitHub side out of --env prod", async () => {
		const ci = await run(
			{ repo },
			{ vault, held: { repo: ["TOKEN_A", "TOKEN_B", "HAND_SET"] } },
			{ environments: ["ci"] }
		);
		expect(ci.lines.join("\n")).not.toMatch(/Deploy|1Password prod/);
		const prod = await run({ repo }, { vault }, { environments: ["prod"] });
		expect(prod.lines.join("\n")).not.toMatch(/GitHub/);
		expect(prod.lines.join("\n")).toMatch(/1Password prod\s+Deploy prod/);
	});
});

describe("doctor secrets — the local and dev columns", () => {
	const credentials = {
		"acme/demo - local": ["HOLOCRON_ORG_TOKEN"],
		"acme/demo - dev": ["HOLOCRON_ORG_TOKEN", "HOLOCRON_ADMIN", "SOMETHING_ELSE"],
	};

	it("shows the tokens the plugins take in a column for each credentials Environment, in the default run", async () => {
		const { lines, report } = await run({ repo }, { vault, credentials });
		const text = lines.join("\n");
		expect(text).toMatch(/name\s+1Password local\s+1Password dev\s+1Password ci/);
		expect(text).toMatch(/HOLOCRON_ORG_TOKEN\s+ok\s+ok/);
		expect(text).toMatch(/HOLOCRON_ADMIN\s+n\/a\s+ok/);
		expect(text).toMatch(/SOMETHING_ELSE\s+n\/a\s+extra/);
		expect(report.rows.find((r) => r.id === "1password:tokens")).toMatchObject({ status: "ok" });
		expect(report.rows.find((r) => r.id === "extra:secret:vault:acme/demo - dev")).toMatchObject({
			status: "skip",
		});
	});

	it("fails a token neither Environment holds, once, in the row the credentials check has always made", async () => {
		const { report } = await run({ repo }, { vault, credentials: { "acme/demo - dev": ["HOLOCRON_ORG_TOKEN"] } });
		expect(
			report.rows.filter((r) => r.status === "fail" && r.id.startsWith("1password")).map((r) => [r.id, r.detail])
		).toEqual([["1password:HOLOCRON_ADMIN", 'missing from "acme/demo - dev"']]);
	});

	it("is limited by --env: local and dev leave the other columns out, ci leaves them out of the matrix", async () => {
		const only = await run({ repo }, { vault, credentials }, { environments: ["dev"] });
		expect(only.lines.find((l) => l.startsWith("name"))).toBe("name                1Password dev");
		const ci = await run({ repo }, { vault, credentials }, { environments: ["ci"] });
		expect(ci.lines.join("\n")).not.toMatch(/1Password (local|dev)/);
	});

	it("is not run for --only-variables", async () => {
		const { lines } = await run({ repo }, { vault, credentials }, { only: "variables" });
		expect(lines.join("\n")).not.toMatch(/1Password (local|dev)/);
	});

	it("shows a missing dev Environment as ? with the reason", async () => {
		const { lines } = await run({ repo }, { vault, credentials: { "acme/demo - local": ["HOLOCRON_ORG_TOKEN"] } });
		expect(lines.join("\n")).toMatch(/HOLOCRON_ORG_TOKEN\s+ok\s+\?/);
	});
});
