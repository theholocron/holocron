import { format } from "prettier";
import { describe, expect, it } from "vitest";

import { turboConfig } from "../../generators/turbo/index.js";
import { createRcConfig } from "../../templates/configs/alexjs/create-config.js";
import { createConfig as createEditorconfigChecker } from "../../templates/configs/editorconfig-checker/create-config.js";

/** The JSON a generator writes is checked by `prettier --check` the moment it lands in a repo: it must already pass. */
const prettified = (text: string): Promise<string> =>
	format(text, { parser: "json", printWidth: 120, tabWidth: 2, useTabs: false });

describe("the JSON files the generators write", () => {
	it("are already formatted: .alexrc.json", async () => {
		const text = createRcConfig();
		expect(await prettified(text)).toBe(text);
	});

	it("are already formatted: .editorconfig-checker.json", async () => {
		const text = createEditorconfigChecker();
		expect(await prettified(text)).toBe(text);
	});

	it("are already formatted: turbo.json, with every task and a task's own additions", async () => {
		const text = turboConfig({
			tasks: [
				"verification.unitTests",
				"verification.typeSafety",
				{ name: "sourceQuality.staticAnalysis", turbo: { dependsOn: ["@x/config#delivery.build"] } },
				{ name: "delivery.build", turbo: { passThroughEnv: ["SENTRY_AUTH_TOKEN"] } },
			],
		});
		expect(text).not.toBeNull();
		expect(await prettified(text as string)).toBe(text);
	});
});
