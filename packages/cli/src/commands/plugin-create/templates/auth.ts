import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	return `import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
\tenvName: "${inputs.tokenEnv}",
\tvendorEnvName: "${inputs.vendorEnv}",
\tkeyringService: "${inputs.slug}",
\terrorMessage:
\t\t"no ${inputs.vendorName} token found. Pass --token <TOKEN>, set ${inputs.tokenEnv} / ${inputs.vendorEnv}, " +
\t\t"or run: holocron auth set ${inputs.slug} <TOKEN>",
});
`;
}
