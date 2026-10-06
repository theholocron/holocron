import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	const factoryName = `create${inputs.vendorName}RestClient`;
	const clientType = `${inputs.vendorName}RestClient`;
	return `import { createRestClient, type RequestOptions, type RestClient } from "@theholocron/cli";

export type { RequestOptions, RestClient };

/**
 * TODO: narrow this to the specific ${inputs.vendorName} endpoints this
 * plugin's capability needs (see \`@theholocron/holocron-plugin-axiom\`'s
 * \`rest.ts\` for the pattern: an interface with one method per endpoint,
 * built internally via \`createRestClient\`). Starts as an alias for the
 * generic client so the scaffold compiles end to end immediately.
 */
export type ${clientType} = RestClient;

export function ${factoryName}(opts: {
\ttoken: string;
\tbaseUrl?: string;
\tfetch?: typeof fetch;
}): ${clientType} {
\treturn createRestClient({
\t\tbaseUrl: opts.baseUrl ?? "${inputs.baseUrl}",
\t\ttoken: opts.token,
\t\tvendor: "${inputs.vendorName}",
\t\tfetch: opts.fetch,
\t});
}
`;
}
