import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { PluginLoader } from "../../plugin/index.js";

const sharedRows = vi.hoisted(() => vi.fn());
vi.mock("./shared-rows.js", () => ({ sharedRows }));

import { runDoctorSecrets } from "./doctor-secrets.js";

type Raw = Parameters<typeof resolveConfig>[0];

const loaded: LoadedConfig = {
	resolved: resolveConfig({ name: "demo", providers: { source: "github" } } as unknown as Raw),
	filepath: "/tmp/test/holocron.config.json",
};
const loader = {
	load: async () => undefined,
	loadedKeys: () => [],
	loadFailures: () => [],
	has: () => false,
	get: () => [],
} as unknown as PluginLoader;

describe("doctor secrets — --shared defaults", () => {
	it("leaves git to the shared check's own default when the caller gives no gitExec", async () => {
		sharedRows.mockResolvedValue({ rows: [], note: "" });
		await runDoctorSecrets({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => undefined,
			logger: fakeLogger(),
			shared: true,
			environments: ["ci", "prod"],
		});
		const given = sharedRows.mock.calls[0]![0] as Record<string, unknown>;
		expect("gitExec" in given).toBe(false);
		expect(given.allow).toEqual([]);
	});
});
