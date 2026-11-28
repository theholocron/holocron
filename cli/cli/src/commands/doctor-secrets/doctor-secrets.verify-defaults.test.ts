import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { PluginLoader } from "../../plugin/index.js";

const verifyRows = vi.hoisted(() => vi.fn());
vi.mock("./verify-rows.js", () => ({ verifyRows }));

import { runDoctorSecrets } from "./doctor-secrets.js";

type Raw = Parameters<typeof resolveConfig>[0];

const loaded: LoadedConfig = {
	resolved: resolveConfig({ name: "demo", providers: { source: "github" } } as unknown as Raw),
	filepath: "/tmp/test/holocron.config.json",
};
const loader = {
	load: async () => undefined,
	loadedKeys: () => ["source"],
	loadFailures: () => [],
	has: () => false,
	get: () => [],
} as unknown as PluginLoader;

describe("doctor secrets — --verify defaults", () => {
	it("leaves the importer, environment, keyring and clock to verify's own defaults when the caller gives none", async () => {
		verifyRows.mockResolvedValue([]);
		await runDoctorSecrets({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => undefined,
			logger: fakeLogger(),
			verify: true,
			environments: ["test"],
		});
		const given = verifyRows.mock.calls[0]![0] as Record<string, unknown>;
		expect(Object.keys(given).sort()).toEqual(["loaded", "loader"]);
	});
});
