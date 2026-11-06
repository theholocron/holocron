import { describe, expect, it } from "vitest";

import { dryRunPreviewEnvVar } from "./dry-run-preview-env-var.js";

describe("dryRunPreviewEnvVar", () => {
	it("prefixes the CLI's own env prefix", () => {
		expect(dryRunPreviewEnvVar("MYCLI")).toBe("MYCLI_DRY_RUN_PREVIEW");
	});
});
