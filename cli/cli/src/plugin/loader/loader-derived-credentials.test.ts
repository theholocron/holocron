import { clearCredentials, getCredential } from "@theholocron/kyber/secrets";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/config/index.js";
import { PluginLoader } from "./loader.js";
import type { PluginImporter } from "./loader.type.js";

const SLUG = "theholocron/holocron";
const remote = async () => "git@github.com:theholocron/holocron.git\n";
const absent = (name: string) => Object.assign(new Error(`no Environment named "${name}"`), { status: 404 });

/** A 1Password `credentials` fake holding `held`; every other Environment is a 404. */
function holding(held: Record<string, Record<string, string>>) {
	const read = vi.fn(async (environment: string) => {
		const found = held[environment];
		if (!found) throw absent(environment);
		return found;
	});
	return { key: "credentials", providerName: "1password", read };
}

async function load(
	impl: ReturnType<typeof holding>,
	env: Record<string, string>,
	extra: { gitExec?: () => Promise<string>; options?: Record<string, unknown> } = {}
) {
	const importer = (async () => ({
		createPlugin: () => ({ name: "1password", capabilities: { credentials: () => impl } }),
	})) as unknown as PluginImporter;
	const loader = new PluginLoader(
		resolveConfig({
			name: "demo",
			providers: { credentials: [["1password", extra.options ?? {}]] },
		} as never),
		{ repoRoot: "/tmp/test-repo" },
		importer,
		{ env, gitExec: extra.gitExec ?? remote }
	);
	await loader.load();
	return loader;
}

describe("PluginLoader: derived credentials Environments (#2063)", () => {
	afterEach(clearCredentials);

	it("reads local and then dev on a machine, local winning", async () => {
		const impl = holding({
			[`${SLUG} - local`]: { T: "local" },
			[`${SLUG} - dev`]: { T: "dev", U: "u" },
		});
		const loader = await load(impl, {});
		expect(impl.read.mock.calls.map(([n]) => n)).toEqual([`${SLUG} - local`, `${SLUG} - dev`]);
		expect(getCredential("T")).toBe("local");
		expect(getCredential("U")).toBe("u");
		expect(loader.loadFailures()).toEqual([]);
	});

	it("skips a missing local silently", async () => {
		const loader = await load(holding({ [`${SLUG} - dev`]: { T: "dev" } }), {});
		expect(getCredential("T")).toBe("dev");
		expect(loader.loadFailures()).toEqual([]);
	});

	it("reports a missing dev by name, with no fallback to ci or prod", async () => {
		const impl = holding({ [`${SLUG} - ci`]: { T: "ci" }, [`${SLUG} - prod`]: { T: "prod" } });
		const loader = await load(impl, {});
		expect(loader.loadFailures().map((f) => f.error.message)).toEqual([
			`1password has no Environment named "${SLUG} - dev"`,
		]);
		expect(getCredential("T")).toBeUndefined();
	});

	it.each([
		["development", { HOLOCRON_ENVIRONMENT: "development" }, "dev"],
		["ci", { CI: "true" }, "ci"],
		["production", { HOLOCRON_ENVIRONMENT: "production" }, "prod"],
	])("reads only its own Environment in the %s layer", async (_layer, env, suffix) => {
		const impl = holding({
			[`${SLUG} - local`]: { T: "local" },
			[`${SLUG} - dev`]: { T: "dev" },
			[`${SLUG} - ci`]: { T: "ci" },
			[`${SLUG} - prod`]: { T: "prod" },
		});
		await load(impl, env);
		expect(impl.read.mock.calls.map(([n]) => n)).toEqual([`${SLUG} - ${suffix}`]);
		expect(getCredential("T")).toBe(suffix);
	});

	it("reports a missing ci by name and does not fall back to dev", async () => {
		const loader = await load(holding({ [`${SLUG} - dev`]: { T: "dev" } }), { CI: "true" });
		expect(loader.loadFailures()[0]?.error.message).toContain(`"${SLUG} - ci"`);
		expect(getCredential("T")).toBeUndefined();
	});

	it("reads nothing in the test layer", async () => {
		const impl = holding({});
		const loader = await load(
			impl,
			{ HOLOCRON_ENVIRONMENT: "test" },
			{ gitExec: async () => Promise.reject(new Error("no remote")) }
		);
		expect(impl.read).not.toHaveBeenCalled();
		expect(loader.loadFailures()).toEqual([]);
	});

	it("lets an explicit environment option win, without reading the remote", async () => {
		const impl = holding({ Mine: { T: "mine" }, [`${SLUG} - dev`]: { T: "dev" } });
		const gitExec = vi.fn(remote);
		await load(impl, {}, { gitExec, options: { environment: "Mine" } });
		expect(impl.read.mock.calls.map(([n]) => n)).toEqual(["Mine"]);
		expect(gitExec).not.toHaveBeenCalled();
	});

	it("falls back to the old names while the new ones are absent (migration)", async () => {
		const loader = await load(holding({ Holocron: { T: "old" } }), {});
		expect(getCredential("T")).toBe("old");
		expect(loader.loadFailures()).toEqual([]);
	});

	it("does not try the old names when the new ones are all there", async () => {
		const impl = holding({ [`${SLUG} - dev`]: { T: "dev" }, Holocron: { T: "old" } });
		await load(impl, {});
		expect(impl.read.mock.calls.map(([n]) => n)).not.toContain("Holocron");
		expect(getCredential("T")).toBe("dev");
	});

	it("names the environment option when the remote cannot be parsed", async () => {
		const loader = await load(holding({}), {}, { gitExec: async () => "/Users/me/code/repo\n" });
		const message = loader.loadFailures()[0]?.error.message;
		expect(message).toMatch(/cannot derive/);
		expect(message).toMatch(/`environment` option/);
	});

	it("passes on a read failure that is not a missing Environment", async () => {
		const impl = holding({});
		impl.read.mockRejectedValue(new Error("op is locked"));
		const loader = await load(impl, {});
		expect(loader.loadFailures()[0]?.error.message).toBe("op is locked");
	});
});
