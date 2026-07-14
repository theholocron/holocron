import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	const factoryName = `create${inputs.vendorName}RestClient`;
	return `import { createRestClient, type RequestOptions, type RestClient } from "@theholocron/cli";

export type { RequestOptions, RestClient };

export function ${factoryName}(opts: {
\ttoken: string;
\tbaseUrl?: string;
\tfetch?: typeof fetch;
}): RestClient {
\treturn createRestClient({
\t\tbaseUrl: opts.baseUrl ?? "${inputs.baseUrl}",
\t\ttoken: opts.token,
\t\tvendor: "${inputs.vendorName}",
\t\tfetch: opts.fetch,
\t});
}
`;
}
