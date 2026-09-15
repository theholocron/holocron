import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("commit-msg createConfig", () => {
	it("starts with the shebang on line 1", () => {
		expect(createConfig()).toMatch(/^#!/);
		expect(createConfig().split("\n")[0]).toBe("#!/bin/sh");
	});

	it("includes the auto-generated header after the shebang", () => {
		const out = createConfig();
		expect(out).toContain("AUTO-GENERATED — do not edit directly");
		const shebangLine = out.indexOf("#!/bin/sh");
		const headerLine = out.indexOf("# AUTO-GENERATED");
		expect(headerLine).toBeGreaterThan(shebangLine);
	});

	it("runs commitlint against the commit message file", () => {
		const out = createConfig();
		expect(out).toContain("commitlint");
		expect(out).toContain('--edit "$1"');
	});

	it("resolves --config against the shared commitlint-config package's built dist when present", () => {
		const out = createConfig();
		expect(out).toContain('COMMITLINT_CONFIG="node_modules/@theholocron/commitlint-config/dist/index.js"');
		expect(out).toContain('npx --no -- commitlint --config "$COMMITLINT_CONFIG" --edit "$1"');
	});

	it("falls back to commitlint's own auto-discovery when the shared package isn't installed", () => {
		const out = createConfig();
		expect(out).toMatch(
			/if \[ -f "\$COMMITLINT_CONFIG" \]; then[\s\S]*else\s*\n\s*npx --no -- commitlint --edit "\$1"\s*\n\s*fi/
		);
	});
});
