import { stripVTControlCharacters } from "node:util";

import { printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";
import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it } from "vitest";

import { resolveConfig } from "../../config/index.js";
import type { EnvironmentEntry, PluginLoader, Vault } from "../../plugin/index.js";
import { compareLayers } from "./compare-layers.js";
import { sharedRows } from "./shared-rows.js";

/** Values that must never reach any output. */
const SHARED = "sentinel-shared-value-9f3a";
const ONLY_DEV = "sentinel-dev-only-value-71c2";
const OTHER = "sentinel-other-value-5b10";

type Layer = "local" | "dev" | "ci" | "prod";
const slug = "acme/demo";
const env = (layer: Layer) => `${slug} - ${layer}`;
const secret = (name: string, value: string): EnvironmentEntry => ({ name, value, concealed: true });
const visible = (name: string, value: string): EnvironmentEntry => ({ name, value, concealed: false });

const origin = async () => "git@github.com:acme/demo.git\n";

interface RunDoctorSharedValuesInput {
	loaded: Parameters<typeof sharedRows>[0]["loaded"];
	context: { repoRoot: string };
	loader: PluginLoader;
	gitExec?: never;
	strict?: boolean;
	allow?: string[];
	print: (l: string) => void;
	logger: ReturnType<typeof fakeLogger>;
}

/** The old `doctor secrets` report, built from the rows and the note `sharedRows()` gives. */
async function runDoctorSharedValues(input: RunDoctorSharedValuesInput) {
	const vault = input.loader.has("vault")
		? (input.loader.get("vault") as unknown as Vault)
		: { why: "needs a `vault` provider in holocron.config.ts (1password)" };
	const result = await sharedRows({
		loaded: input.loaded,
		context: input.context,
		vault,
		...(input.gitExec ? { gitExec: input.gitExec } : {}),
		layers: ["local", "dev", "ci", "prod"],
		strict: input.strict === true,
		allow: input.allow ?? [],
	});
	printCheckRows(result.rows, input.print);
	input.print(result.note);
	const summary = summariseChecks(result.rows);
	printCheckSummary(summary, input.print);
	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	input.logger.info({ ...summary, status }, "doctor shared-values");
	return { status, rows: result.rows, summary };
}

/** A fake world: layer to its entries, or an Error; a layer that is absent throws "not found". */
async function run(
	world: Partial<Record<Layer, EnvironmentEntry[] | Error>>,
	extra: Partial<RunDoctorSharedValuesInput> = {},
	vaultOver: Record<string, unknown> | null = {},
	config: Record<string, unknown> = {}
) {
	const lines: string[] = [];
	const logger = fakeLogger();
	const read = async (environment: string): Promise<EnvironmentEntry[]> => {
		const layer = environment.replace(`${slug} - `, "") as Layer;
		const found = world[layer];
		// An absent layer is an empty Environment, except `local`, which most machines do not have.
		if (found === undefined && layer !== "local") return [];
		if (found === undefined) throw new Error(`"${environment}" not found`);
		if (found instanceof Error) throw found;
		return found;
	};
	const vault =
		vaultOver === null ? undefined : { providerName: "1password", readEnvironmentEntries: read, ...vaultOver };
	const loader = {
		load: async () => undefined,
		loadFailures: () => [],
		loadedKeys: () => ["vault"],
		has: (key: string) => key === "vault" && vault !== undefined,
		get: () => vault,
	} as unknown as PluginLoader;
	const report = await runDoctorSharedValues({
		loaded: {
			resolved: resolveConfig({ name: "demo", org: "acme", providers: {}, ...config } as never),
			filepath: "/x",
		},
		context: { repoRoot: "/tmp/test" },
		loader,
		gitExec: origin as never,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger,
		...extra,
	});
	const text = lines.join("\n");
	return { report, text, everything: `${text}${JSON.stringify(report)}${JSON.stringify(logger.info.mock.calls)}` };
}

describe("sharedRows", () => {
	it("is ok when no secret shares a value", async () => {
		const { report, text } = await run({
			dev: [secret("TOKEN", ONLY_DEV)],
			ci: [secret("TOKEN", OTHER)],
		});
		expect(report.status).toBe("ok");
		expect(text).toContain("ci = dev");
		expect(text).toContain("no secret shares a value");
		expect(text).toContain("3 pairs compared, 0 shared names");
	});

	it("reports one pair that shares a value as info, and exits ok by default", async () => {
		const { report, text } = await run({
			dev: [secret("TOKEN", SHARED), secret("B", ONLY_DEV)],
			ci: [secret("TOKEN", SHARED), secret("B", OTHER)],
		});
		expect(report.rows).toHaveLength(3);
		expect(report.rows[0]).toMatchObject({ status: "skip", title: "ci = dev" });
		expect(text).toContain("info: 1 secret shares a value between dev and ci: TOKEN");
		expect(text).toContain("3 pairs compared, 1 shared name");
		expect(report.status).toBe("ok");
	});

	it("reports every pair of layers when all share a value", async () => {
		const { report, text } = await run({
			local: [secret("A", SHARED)],
			dev: [secret("A", SHARED), secret("Z", SHARED)],
			ci: [secret("A", SHARED)],
			prod: [secret("A", SHARED)],
		});
		const titles = report.rows.map((r) => r.title);
		expect(titles).toEqual(["dev = local", "ci = local", "ci = dev", "prod = local", "prod = dev", "prod = ci"]);
		expect(text).toContain("dev = local");
		expect(text).toContain("2 secrets share a value between local and dev: A, Z = A");
		expect(text).toContain("6 pairs compared, 9 shared names");
	});

	it("leaves out a name allowed in the config, by --allow, in any letter case, and when either side is allowed", async () => {
		const world = {
			dev: [secret("ONE", SHARED), secret("TWO", OTHER), secret("THREE", ONLY_DEV)],
			ci: [secret("one", SHARED), secret("TWO", OTHER), secret("FOUR", ONLY_DEV)],
		};
		const { text } = await run(world, { allow: ["two", "four"] }, {}, { doctor: { sharedVariables: ["ONE"] } });
		expect(text).toContain("no secret shares a value");
		expect(text).toContain("0 shared names");
		// THREE and FOUR hold one value under two names; allowing one side is enough.
		const withBoth = await run(world, {});
		expect(withBoth.text).toContain("FOUR = THREE");
		const oneSide = await run(world, { allow: ["FOUR", "one", "TWO"] });
		expect(oneSide.text).toContain("0 shared names");
	});

	it("makes a shared secret a failure with --strict", async () => {
		const { report, text } = await run(
			{ dev: [secret("TOKEN", SHARED)], ci: [secret("TOKEN", SHARED)] },
			{ strict: true }
		);
		expect(report.status).toBe("fail");
		expect(report.rows[0]!.status).toBe("fail");
		expect(text).toContain("1 secret shares a value between dev and ci: TOKEN");
		expect(text).not.toContain("info:");
	});

	it("skips a layer that cannot be read, naming it, and still compares the rest", async () => {
		const { report, text } = await run({
			dev: [secret("TOKEN", SHARED)],
			ci: [secret("TOKEN", SHARED)],
			prod: new Error("session expired"),
		});
		expect(text).toContain(`Environment "${env("prod")}"`);
		expect(text).toContain("could not read it: session expired");
		expect(report.rows.map((r) => r.title)).toContain("ci = dev");
	});

	it("is silent about a missing or unreadable local layer", async () => {
		const { report, text } = await run({ local: new Error("not found"), dev: [], ci: [] });
		expect(text).not.toContain("local");
		expect(report.rows).toHaveLength(3);
	});

	it("says there is nothing to compare when fewer than two layers can be read", async () => {
		const { report, text } = await run({
			dev: [secret("A", SHARED)],
			ci: new Error("down"),
			prod: new Error("down"),
		});
		expect(report.status).toBe("skip");
		expect(text).toContain("fewer than two layers could be read");
		expect(text).toContain("0 pairs compared");
	});

	it("ignores a visible entry, even when two layers hold the same value", async () => {
		const { text } = await run({
			dev: [visible("PUBLIC_URL", SHARED), secret("TOKEN", ONLY_DEV)],
			ci: [visible("PUBLIC_URL", SHARED), secret("TOKEN", OTHER)],
		});
		expect(text).toContain("no secret shares a value");
		expect(text).not.toContain("PUBLIC_URL");
	});

	it("ignores an empty value", async () => {
		const { text } = await run({ dev: [secret("A", "")], ci: [secret("A", "")] });
		expect(text).toContain("no secret shares a value");
	});

	it("compares every entry, and says so, when the vault cannot tell which are concealed", async () => {
		const { report, text } = await run(
			{},
			{},
			{
				readEnvironmentEntries: undefined,
				readEnvironment: async (environment: string) =>
					environment.endsWith("dev") || environment.endsWith("ci")
						? { PUBLIC_URL: SHARED }
						: Promise.reject(new Error("no")),
			}
		);
		expect(text).toContain("1password cannot say which entries are concealed");
		expect(text).toContain("1 secret shares a value between dev and ci: PUBLIC_URL");
		expect(report.rows[0]!.id).toBe("concealed");
	});

	it("skips with the reason when there is no vault, or it cannot read an environment", async () => {
		const none = await run({}, {}, null);
		expect(none.report.status).toBe("skip");
		expect(none.text).toContain("needs a `vault` provider");
		const cannot = await run({}, {}, { readEnvironmentEntries: undefined, readEnvironment: undefined });
		expect(cannot.text).toContain("1password cannot read an environment's variables");
	});

	it("skips with the reason when the origin remote does not name the repository", async () => {
		const { report, text } = await run({}, { gitExec: (async () => "") as never });
		expect(report.status).toBe("skip");
		expect(text).toContain("`origin` remote");
	});

	it("reports a variable that ci has and dev lacks, by name, as info", async () => {
		const { report, text } = await run({
			dev: [visible("KEPT", "same")],
			ci: [visible("KEPT", "same"), visible("ORG_CONSTANT", "v1")],
		});
		const row = report.rows.find((r) => r.id === "shared:variables:missing");
		expect(row).toMatchObject({ status: "skip", title: "variables missing from dev, present in ci" });
		expect(text).toContain("info: 1 variable: ORG_CONSTANT");
		expect(text).toContain("1 variable drifting");
		expect(report.rows.some((r) => r.id === "shared:variables:differ")).toBe(false);
	});

	it("reports variables whose value differs between ci and dev, by name, even with --strict", async () => {
		const { report, text } = await run(
			{
				dev: [visible("B_URL", "dev-b"), visible("A_URL", "dev-a"), visible("SAME", "same")],
				ci: [visible("B_URL", "ci-b"), visible("A_URL", "ci-a"), visible("SAME", "same")],
			},
			{ strict: true }
		);
		expect(text).toContain("variables differ between ci and dev");
		expect(text).toContain("info: 2 variables: A_URL, B_URL");
		expect(text).toContain("2 variables drifting");
		expect(report.status).toBe("ok");
	});

	it("adds no row for identical variables, and ignores case and an allowed name", async () => {
		const { report, text } = await run(
			{
				dev: [visible("same", "x"), visible("OLD", "1")],
				ci: [visible("SAME", "x"), visible("OLD", "2"), visible("GONE", "3")],
			},
			{ allow: ["old", "gone"] }
		);
		expect(report.rows.some((r) => r.id.startsWith("shared:variables:"))).toBe(false);
		expect(text).toContain("0 variables drifting");
	});

	it("does not compare variables when ci or dev could not be read", async () => {
		const { report } = await run({ dev: [visible("A", "1")], ci: new Error("down") });
		expect(report.rows.some((r) => r.id.startsWith("shared:variables:"))).toBe(false);
	});

	it("never lets a value, a digest or a length reach the output, the report, the logger or an error", async () => {
		const { everything } = await run({
			dev: [
				secret("TOKEN", SHARED),
				secret("OWN", ONLY_DEV),
				visible("DRIFT", "sentinel-var-dev-4d21"),
				visible("PUBLIC", "sentinel-var-same-88aa"),
			],
			ci: [
				secret("TOKEN", SHARED),
				secret("OWN", OTHER),
				visible("DRIFT", "sentinel-var-ci-e07c"),
				visible("PUBLIC", "sentinel-var-same-88aa"),
				visible("ONLY_CI", "sentinel-var-only-1b9f"),
			],
			// A vault whose error message quotes a value it read earlier.
			prod: new Error(`bad response near ${SHARED} and ${ONLY_DEV}`),
		});
		for (const value of [
			SHARED,
			ONLY_DEV,
			OTHER,
			"sentinel-var-dev-4d21",
			"sentinel-var-ci-e07c",
			"sentinel-var-same-88aa",
			"sentinel-var-only-1b9f",
		])
			expect(everything).not.toContain(value);
		expect(everything).toContain("[redacted]");
		expect(everything).not.toMatch(/[0-9a-f]{32}/);
		expect(everything).not.toContain(String(SHARED.length));
	});
});

describe("compareLayers", () => {
	const layers = (a: EnvironmentEntry[], b: EnvironmentEntry[]) => [
		{ layer: "dev" as const, environment: "e1", entries: a },
		{ layer: "ci" as const, environment: "e2", entries: b },
	];

	it("returns names only, sorted, one result per pair", () => {
		const result = compareLayers(
			layers([secret("B", SHARED), secret("A", OTHER)], [secret("B", SHARED), secret("A", OTHER)]),
			[]
		);
		expect(result).toEqual([{ layer: "ci", other: "dev", names: ["A", "B"] }]);
		expect(JSON.stringify(result)).not.toContain(SHARED);
	});

	it("uses a fresh salt per call, so nothing it computes is comparable between calls", () => {
		// Same input, same answer: the salt changes the digests, never the result.
		const input = layers([secret("A", SHARED)], [secret("A", SHARED)]);
		expect(compareLayers(input, [])).toEqual(compareLayers(input, []));
	});

	it("returns nothing for fewer than two layers", () => {
		expect(compareLayers([], [])).toEqual([]);
	});
});
