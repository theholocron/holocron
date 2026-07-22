import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	const clientClass = `${inputs.vendorName}RestClient`;
	return `import { describe, it } from "vitest";

import { ${inputs.capabilityClass} } from "../capabilities/${inputs.capability}.js";
import { ${clientClass} } from "../rest.js";
import { stubFetch } from "./helpers.js";

// Stub client used by the constructor smoke test. Real capability
// tests replace this with per-method stubs once implementations land.
function makeCapability() {
	const stub = stubFetch([]);
	const rest = new ${clientClass}({ token: "t", fetch: stub.fetch });
	return new ${inputs.capabilityClass}(rest);
}

describe("${inputs.capabilityClass}", () => {
	it("constructs with a REST client", () => {
		makeCapability();
	});

	// TODO: implement one test per ${inputs.capability} capability method
	// as you fill in the class stubs. See other plugins for reference
	// patterns:
	//   - REST behaviors (URL / method / body / query) via \`stub.calls\`
	//   - Error paths via \`stubFetch([{ status: 4xx, body: {...} }])\`
	//   - Idempotency (409 handling for ensure* methods, if applicable)
	it.todo("implement per-method tests");
});
`;
}
