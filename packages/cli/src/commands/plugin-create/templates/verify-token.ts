import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	const clientClass = `${inputs.vendorName}RestClient`;
	return `/**
 * \`verifyToken\` — plugin-level export used by \`holocron auth set\` +
 * \`holocron auth check\`. Hits a lightweight whoami-style endpoint
 * and translates the response into the normalized \`VerifyTokenResult\`
 * shape.
 *
 * Kept as a standalone function (not a capability method) so the auth
 * command can call it without initializing the full plugin — plugin
 * construction requires an already-resolved token, which is exactly
 * what we don't have yet at bootstrap time.
 *
 * TODO: replace \`/me\` with the ${inputs.vendorName} equivalent of a
 * "check my token" endpoint. Common shapes: \`/user\`, \`/whoami\`,
 * \`/me\`, \`/account\`.
 */

import { ${clientClass} } from "./rest.js";

export interface VerifyTokenSuccess {
	ok: true;
	subject: string;
}

export interface VerifyTokenFailure {
	ok: false;
	message: string;
}

export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure;

interface MeResponse {
	/** Adjust to whatever ${inputs.vendorName}'s whoami endpoint returns. */
	name?: string;
	email?: string;
	id?: string;
}

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const restOpts: ConstructorParameters<typeof ${clientClass}>[0] = { token };
	if (opts.baseUrl !== undefined) restOpts.baseUrl = opts.baseUrl;
	if (opts.fetch !== undefined) restOpts.fetch = opts.fetch;
	const rest = new ${clientClass}(restOpts);
	try {
		const me = await rest.request<MeResponse>("/me");
		// Optional chaining because \`me\` is \`undefined\` on 204 / empty body.
		const subject = me?.email ?? me?.name ?? me?.id ?? "unknown";
		return { ok: true, subject: \`user @ \${subject}\` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
`;
}
