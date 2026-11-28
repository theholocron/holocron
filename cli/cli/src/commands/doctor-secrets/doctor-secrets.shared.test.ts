import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { EnvironmentEntry, PluginLoader } from "../../plugin/index.js";
import { runDoctorSecrets } from "./doctor-secrets.js";
import type { DoctorEnvironment } from "./doctor-secrets.type.js";

const VALUE = "sentinel-shared-value-9f3a";
type Layer = "local" | "dev" | "ci" | "prod";
const entries: Record<Layer, EnvironmentEntry[]> = {
	local: [],
	dev: [{ name: "TOKEN", value: VALUE, concealed: true }],
	ci: [{ name: "TOKEN", value: VALUE, concealed: true }],
	prod: [{ name: "TOKEN", value: "other", concealed: true }],
};

function setup(opts: { vault?: boolean; config?: Record<string, unknown> } = {}) {
	const readEnvironmentEntries = vi.fn(async (environment: string) => entries[environment.split(" - ")[1] as Layer]);
	const loaded: LoadedConfig = {
		resolved: resolveConfig({ name: "demo", org: "acme", providers: {}, ...opts.config } as never),
		filepath: "/x",
	};
	const vault = opts.vault === false ? undefined : { providerName: "1password", readEnvironmentEntries };
	const loader = {
		load: async () => undefined,
		loadedKeys: () => ["vault"],
		loadFailures: () => [],
		has: (key: string) => key === "vault" && vault !== undefined,
		get: () => vault,
	} as unknown as PluginLoader;
	return { loaded, loader, readEnvironmentEntries };
}

async function run(
	extra: { environments?: DoctorEnvironment[]; strict?: boolean; allow?: string[]; shared?: boolean } = {},
	opts: Parameters<typeof setup>[0] = {}
) {
	const { loaded, loader, readEnvironmentEntries } = setup(opts);
	const lines: string[] = [];
	const report = await runDoctorSecrets({
		loaded,
		context: { repoRoot: "/tmp/test" },
		loader,
		gitExec: (async () => "git@github.com:acme/demo.git\n") as never,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
		shared: true,
		environments: ["local", "dev", "ci", "prod"],
		...extra,
	});
	return { report, text: lines.join("\n"), readEnvironmentEntries };
}

describe("doctor secrets — --shared", () => {
	it("reads no value unless it is asked to", async () => {
		const { loaded, loader, readEnvironmentEntries } = setup();
		await runDoctorSecrets({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => undefined,
			logger: fakeLogger(),
		});
		expect(readEnvironmentEntries).not.toHaveBeenCalled();
	});

	it("names the secrets two layers share, as info, and never a value", async () => {
		const { report, text } = await run();
		expect(text).toContain("info: 1 secret shares a value between dev and ci: TOKEN");
		expect(text).toContain("pairs compared, 1 shared name");
		expect(report.status).toBe("ok");
		expect(JSON.stringify(report) + text).not.toContain(VALUE);
	});

	it("compares only the layers --env names, and reads only those Environments", async () => {
		const { text, readEnvironmentEntries } = await run({ environments: ["dev", "prod"] });
		expect(readEnvironmentEntries.mock.calls.map(([name]) => name)).toEqual([
			"acme/demo - dev",
			"acme/demo - prod",
		]);
		expect(text).toContain("prod = dev");
		expect(text).not.toContain("ci = dev");
	});

	it("compares all four layers when --env is not given", async () => {
		const { loaded, loader, readEnvironmentEntries } = setup();
		await runDoctorSecrets({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			gitExec: (async () => "git@github.com:acme/demo.git\n") as never,
			shared: true,
			print: () => undefined,
			logger: fakeLogger(),
		});
		expect(readEnvironmentEntries).toHaveBeenCalledTimes(4);
	});

	it("fails a shared secret with --strict, and leaves out a name passed with --allow or in doctor.sharedVariables", async () => {
		expect((await run({ strict: true })).report.status).toBe("fail");
		expect((await run({ strict: true, allow: ["TOKEN"] })).report.status).toBe("ok");
		const config = { doctor: { sharedVariables: ["token"] } };
		expect((await run({ strict: true }, { config })).report.status).toBe("ok");
	});

	it("says it needs two layers when --env names fewer", async () => {
		const { report, readEnvironmentEntries } = await run({ environments: ["dev", "test"] });
		expect(report.rows.find((r) => r.id === "shared:layers")).toMatchObject({
			status: "skip",
			detail: "--shared needs two or more of local, dev, ci and prod in --env",
		});
		expect(readEnvironmentEntries).not.toHaveBeenCalled();
	});

	it("skips, with the reason, when there is no vault provider", async () => {
		const { report } = await run({}, { vault: false });
		expect(report.rows.find((r) => r.id === "shared:vault")).toMatchObject({ status: "skip" });
	});
});
