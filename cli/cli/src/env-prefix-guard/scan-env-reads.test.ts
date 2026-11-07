import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFERRED_ENV_NAMES, THIRD_PARTY_ENV_NAMES } from "./env-allowlist.js";
import { scanEnvReads } from "./scan-env-reads.js";

const none = new Set<string>();
const names = (source: string, allowed: ReadonlySet<string> = none) => scanEnvReads(source, allowed).map((r) => r.name);

describe("scanEnvReads", () => {
	it("flags a bare Holocron-owned name read from a lookup", () => {
		expect(names(`const env = createEnvLookup(); env.get("AXIOM_DATASET");`)).toEqual(["AXIOM_DATASET"]);
		expect(names(`createEnvLookup(deps.env).get("SENTRY_DSN");`)).toEqual(["SENTRY_DSN"]);
		expect(names(`deps.env.get("POSTHOG_HOST");`)).toEqual(["POSTHOG_HOST"]);
	});

	it("reports the line of the read", () => {
		expect(scanEnvReads(`\n\nenv.get("AXIOM_DATASET");`, none)).toEqual([{ name: "AXIOM_DATASET", line: 3 }]);
	});

	it("flags env.NAME, env['NAME'] and process.env reads", () => {
		expect(names(`const a = env.VERCEL_TEAM_ID; const b = env["PORT"]; const c = process.env.BASE_SHA;`)).toEqual([
			"VERCEL_TEAM_ID",
			"PORT",
			"BASE_SHA",
		]);
	});

	it("accepts a read through the prefix helper, direct or through a variable or a parameter default", () => {
		expect(names(`holocronEnv().get("AXIOM_DATASET");`)).toEqual([]);
		expect(names(`withEnvPrefix(env, "HOLOCRON").get("AXIOM_DATASET");`)).toEqual([]);
		expect(names(`const e = holocronEnv(x); e.get("PORT"); e.PORT;`)).toEqual([]);
		expect(names(`function f(env: EnvLookup = holocronEnv()) { return env.get("GOOGLE_CLIENT_ID"); }`)).toEqual([]);
	});

	it("accepts env.NAME and env['NAME'] when env is a prefixed lookup", () => {
		expect(names(`const env = holocronEnv(x); env.PORT; env["PORT"];`)).toEqual([]);
	});

	it("accepts names that are already owned by a prefix", () => {
		expect(
			names(`env.get("HOLOCRON_OTP"); env.SENTINEL_WEBHOOK_SECRET; env.get("COMLINK_SENTRY_SECRET");`)
		).toEqual([]);
	});

	it("accepts an allowlisted name, and nothing else", () => {
		const allowed = new Set(["CI"]);
		expect(names(`env.get("CI"); env.get("NPM_TOKEN");`, allowed)).toEqual(["NPM_TOKEN"]);
	});

	it("accepts a bare name whose HOLOCRON_ spelling the same file reads (the explicit pair)", () => {
		expect(names(`firstEnv(env, ["HOLOCRON_AXIOM_DATASET", "AXIOM_DATASET"]);`)).toEqual([]);
		expect(names(`l.get("HOLOCRON_AXIOM_TOKEN") ?? l.get("AXIOM_TOKEN");`)).toEqual([]);
	});

	it("checks the names handed to firstEnv, as an array or as arguments, unless it reads through the prefix", () => {
		expect(names(`firstEnv(env, ["GH_TOKEN", "FOO_TOKEN"]);`)).toEqual(["GH_TOKEN", "FOO_TOKEN"]);
		expect(names(`firstEnv(undefined, "FOO_TOKEN");`)).toEqual(["FOO_TOKEN"]);
		expect(names(`firstEnv(holocronEnv(), ["FOO_TOKEN"]);`)).toEqual([]);
	});

	it("checks resolveValue names unless a prefix option is given", () => {
		expect(names(`resolveValue(["CLOUDFLARE_ACCOUNT_ID"], env);`)).toEqual(["CLOUDFLARE_ACCOUNT_ID"]);
		expect(names(`resolveValue(["CLOUDFLARE_ACCOUNT_ID"]);`)).toEqual(["CLOUDFLARE_ACCOUNT_ID"]);
		expect(names(`resolveValue(["CLOUDFLARE_ACCOUNT_ID"], env, { prefix: PREFIX });`)).toEqual([]);
		expect(names(`resolveValue(names, env);`)).toEqual([]);
	});

	it("ignores names built at run time, lower-case keys and receivers that are not an environment", () => {
		expect(
			names('env.get(`${PREFIX}_ORG`); env.get(name); keyring.get("AXIOM_DATASET"); env.get("axiom");')
		).toEqual([]);
		expect(names(`files.get("README"); env.get; process.env;`)).toEqual([]);
	});

	it("reads a template literal with no substitution as a name", () => {
		expect(names("env.get(`PORT`);")).toEqual(["PORT"]);
	});
});

/** Every non-test TypeScript source file in the workspace. */
function sources(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (
				["node_modules", "dist", "coverage", ".git", ".claude", ".astro", ".turbo", ".vercel-deploy"].includes(
					entry.name
				)
			)
				continue;
			sources(join(dir, entry.name), out);
		} else if (/\.ts$/.test(entry.name) && !/\.(test|spec|d)\.ts$/.test(entry.name)) {
			out.push(join(dir, entry.name));
		}
	}
	return out;
}

describe("the workspace", () => {
	it("reads no Holocron-owned bare variable without the HOLOCRON_ prefix", () => {
		const root = fileURLToPath(new URL("../../../..", import.meta.url));
		const allowed = new Set([...THIRD_PARTY_ENV_NAMES, ...DEFERRED_ENV_NAMES]);
		const offenders = sources(root).flatMap((file) =>
			scanEnvReads(readFileSync(file, "utf8"), allowed).map(
				(read) => `${relative(root, file)}:${read.line} ${read.name}`
			)
		);
		// A new read of a name Holocron chooses goes through holocronEnv() or resolveValue(names, env, { prefix: PREFIX });
		// a name a third party reads itself is added to env-allowlist.ts. See docs/src/content/docs/environment-variables.mdx.
		expect(offenders).toEqual([]);
	});
});
