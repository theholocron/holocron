import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	const clientClass = `${inputs.vendorName}RestClient`;
	const capabilityInterface = inputs.capability.charAt(0).toUpperCase() + inputs.capability.slice(1);
	return `/**
 * \`${inputs.capability}\` capability for ${inputs.vendorName}.
 *
 * Methods are STUBS — implement them against ${inputs.vendorName}'s
 * REST API per the \`${capabilityInterface}\` interface contract in
 * \`@theholocron/cli\`.
 *
 * TODO once you've stubbed the interface methods, restore the type
 * import + \`implements\` clause:
 *   import type { ${capabilityInterface} } from "@theholocron/cli";
 *   export class ${inputs.capabilityClass} implements ${capabilityInterface} { ... }
 */

import type { ${clientClass} } from "../rest.js";

export class ${inputs.capabilityClass} {
	readonly key = "${inputs.capability}" as const;
	readonly providerName = "${inputs.slug}";

	constructor(private readonly rest: ${clientClass}) {}

	// TODO: implement the ${capabilityInterface} interface methods
	// (see \`packages/cli/src/capabilities/index.ts\`). Each method
	// should hit a specific ${inputs.vendorName} REST endpoint via
	// \`this.rest.request(...)\`. Once methods are stubbed, add
	// \`implements ${capabilityInterface}\` to the class declaration
	// above and remove the \`as unknown as\` cast in src/index.ts.
}
`;
}
