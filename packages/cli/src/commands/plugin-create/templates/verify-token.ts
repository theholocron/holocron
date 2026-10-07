import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	const factoryName = `create${inputs.vendorName}RestClient`;
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

import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { ${factoryName} } from "./rest.js";

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
	const restOpts: { token: string; baseUrl?: string; fetch?: typeof fetch } = { token };
	if (opts.baseUrl !== undefined) restOpts.baseUrl = opts.baseUrl;
	if (opts.fetch !== undefined) restOpts.fetch = opts.fetch;
	const rest = ${factoryName}(restOpts);
	try {
		const me = await rest.request<MeResponse>("/me");
		// Optional chaining because \`me\` is \`undefined\` on 204 / empty body.
		const subject = me?.email ?? me?.name ?? me?.id ?? "unknown";
		return { ok: true, subject: \`user @ \${subject}\` };
	} catch (err) {
		return { ok: false, message: errorMessage(err) };
	}
}
`;
}
