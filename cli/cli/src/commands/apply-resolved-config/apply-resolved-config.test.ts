import { beforeEach, describe, expect, it, vi } from "vitest";

const build = vi.hoisted(() => vi.fn());
const apply = vi.hoisted(() => vi.fn());
vi.mock("../../observability/logger/index.js", () => ({ buildCliLogger: build }));
vi.mock("../../observability/telemetry/index.js", () => ({ applyConfig: apply }));

import { applyResolvedConfig, cliLoggerOpts } from "./apply-resolved-config.js";

beforeEach(() => vi.clearAllMocks());

describe("cliLoggerOpts", () => {
	it("takes the level and Axiom dataset from the config, and the org from the flag before the config", () => {
		const resolved = { org: "from-config", log: { level: "warn" as const, axiom: { dataset: "ds" } } };
		expect(cliLoggerOpts({ org: "from-flag" }, resolved)).toEqual({
			configLevel: "warn",
			configAxiomDataset: "ds",
			org: "from-flag",
		});
		expect(cliLoggerOpts({}, { org: "from-config" })).toMatchObject({ org: "from-config" });
	});

	it("leaves out what the config does not set", () => {
		expect(cliLoggerOpts({ org: "o" }, {})).toEqual({
			configLevel: undefined,
			configAxiomDataset: undefined,
			org: "o",
		});
	});
});

describe("applyResolvedConfig", () => {
	it("rebuilds the logger from the config, then applies the telemetry layer", () => {
		const telemetry = { enabled: false };
		applyResolvedConfig({ verbose: true }, { org: "o", log: { level: "debug" }, telemetry });
		expect(build).toHaveBeenCalledWith(
			{ verbose: true },
			expect.objectContaining({ configLevel: "debug", org: "o" })
		);
		expect(apply).toHaveBeenCalledWith(telemetry);
		expect(build.mock.invocationCallOrder[0]!).toBeLessThan(apply.mock.invocationCallOrder[0]!);
	});
});
