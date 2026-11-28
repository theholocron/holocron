import { clearCredentials } from "@theholocron/kyber/secrets";
import { fakeLogger } from "@theholocron/observability/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginLoader, WorkspaceContextError } from "../../plugin/index.js";
import type { AuthImporter } from "../auth/index.js";
import { runDoctorSecrets } from "./doctor-secrets.js";
import type { DoctorEnvironment } from "./doctor-secrets.type.js";

type Raw = Parameters<typeof resolveConfig>[0];

const loaded: LoadedConfig = {
	resolved: resolveConfig({ name: "demo", providers: { source: "github" } } as unknown as Raw),
	filepath: "/tmp/test/holocron.config.json",
};
const ADMIN = { envName: "HOLOCRON_ADMIN_TOKEN", keyringKey: "github.admin" };

afterEach(clearCredentials);

function loaderOf(load: () => Promise<void> = async () => undefined): PluginLoader {
	return {
		load,
		loadedKeys: () => ["source"],
		loadFailures: () => [],
		has: () => false,
		get: () => [],
	} as unknown as PluginLoader;
}

async function run(opts: { verify?: boolean; environments?: DoctorEnvironment[]; load?: () => Promise<void> } = {}) {
	const verifyToken = vi.fn(async () => ({ ok: true as const, subject: "user @ a" }));
	const importer: AuthImporter = async () => ({ tokens: [ADMIN], verifyToken });
	const report = await runDoctorSecrets({
		loaded,
		context: { repoRoot: "/tmp/test" },
		loader: loaderOf(opts.load),
		importer,
		processEnv: { HOLOCRON_ADMIN_TOKEN: "ghp_secret" },
		keyring: () => null,
		now: () => new Date("2026-11-01T00:00:00Z"),
		print: () => undefined,
		logger: fakeLogger(),
		...(opts.verify ? { verify: true } : {}),
		...(opts.environments ? { environments: opts.environments } : {}),
	});
	return { report, verifyToken };
}

describe("doctor secrets — --verify", () => {
	it("stays offline by default: no vendor is asked", async () => {
		const { report, verifyToken } = await run();
		expect(verifyToken).not.toHaveBeenCalled();
		expect(report.rows.some((r) => r.id.startsWith("verify:"))).toBe(false);
	});

	it("asks each vendor whether its token is still accepted, and says where it came from", async () => {
		const { report, verifyToken } = await run({ verify: true });
		expect(verifyToken).toHaveBeenCalledWith("ghp_secret");
		expect(report.rows.find((r) => r.id === "verify:github.admin")).toMatchObject({
			status: "ok",
			detail: "user @ a (HOLOCRON_ADMIN_TOKEN)",
		});
		expect(JSON.stringify(report)).not.toContain("ghp_secret");
	});

	it("verifies whichever environments are asked about, even only test", async () => {
		const { report } = await run({ verify: true, environments: ["test"] });
		expect(report.rows.map((r) => r.id)).toEqual(["env-test", "verify:github.admin"]);
	});

	it("skips, with the reason, when the credentials providers cannot be loaded", async () => {
		const { report } = await run({
			verify: true,
			environments: ["test"],
			load: async () => {
				throw new Error("op is not installed");
			},
		});
		expect(report.rows.find((r) => r.id === "verify:credentials")).toMatchObject({
			status: "skip",
			detail: "could not load the credentials providers: op is not installed",
		});
	});

	it("lets a missing plugin package stop the run, as every workspace command does", async () => {
		const err = await run({
			verify: true,
			environments: ["test"],
			load: async () => {
				throw new WorkspaceContextError("doctor secrets", ["@theholocron/holocron-plugin-github"]);
			},
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WorkspaceContextError);
	});
});
