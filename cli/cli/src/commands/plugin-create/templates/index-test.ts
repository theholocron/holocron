import type { TemplateInputs } from "../template-inputs/index.js";

export function render(inputs: TemplateInputs): string {
	return `import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { AUTH_HINT, createPlugin } from "./index.js";

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
