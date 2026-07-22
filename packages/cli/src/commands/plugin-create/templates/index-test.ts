import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	return `import { describe, expect, it } from "vitest";

import { AUTH_HINT, createPlugin } from "../index.js";
import { stubFetch } from "./helpers.js";

describe("createPlugin", () => {
	it("wires the ${inputs.capability} capability against the given fetch + token", () => {
		const stub = stubFetch([]);
		const plugin = createPlugin({
			cliToken: "test-token",
			fetch: stub.fetch,
		});
		expect(plugin.name).toBe("@theholocron/holocron-plugin-${inputs.slug}");
		expect(typeof plugin.capabilities.${inputs.capability}).toBe("function");
	});
});

describe("AUTH_HINT", () => {
	it("mentions the holocron auth set command", () => {
		expect(AUTH_HINT).toMatch(/holocron auth set ${inputs.slug}/);
	});
});
`;
}
