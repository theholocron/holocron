export class TokenParseError extends Error {
	override name = "TokenParseError";
}

export interface ParsedTokenArgs {
	/** Set when a bare (unkeyed) --token value was passed. Used as fallback for all plugins. */
	cliToken?: string;
	/** Set when one or more vendor=value pairs were passed. */
	cliTokens?: Record<string, string>;
}

/**
 * Converts raw --token CLI values into a typed result.
 *
 * Bare form:   --token ghp_xxx            → { cliToken: "ghp_xxx" }
 * Keyed form:  --token github=ghp_xxx     → { cliTokens: { github: "ghp_xxx" } }
 * Mixed:       --token github=ghp_xxx --token v_yyy
 *                                         → { cliToken: "v_yyy", cliTokens: { github: "ghp_xxx" } }
 *
 * Values may contain "=" (e.g. base64 strings) — only the first "=" is treated as a separator.
 */
export function parseTokenArgs(tokens: string[]): ParsedTokenArgs {
	if (tokens.length === 0) return {};

	const cliTokens: Record<string, string> = {};
	const bare: string[] = [];

	for (const raw of tokens) {
		const eqIdx = raw.indexOf("=");

		if (eqIdx === -1) {
			bare.push(raw);
			continue;
		}

		const vendor = raw.slice(0, eqIdx);
		const value = raw.slice(eqIdx + 1);

		if (vendor.trim() === "") {
			throw new TokenParseError(`invalid --token value "${raw}": vendor name must not be empty`);
		}
		if (/\s/.test(vendor)) {
			throw new TokenParseError(`invalid --token value "${raw}": vendor name must not contain whitespace`);
		}
		if (value === "") {
			throw new TokenParseError(`invalid --token value "${raw}": token value must not be empty`);
		}

		cliTokens[vendor] = value;
	}

	if (bare.length > 1) {
		throw new TokenParseError(
			`only one bare --token value is allowed; got ${bare.length.toString()} — use vendor=value form for multiple tokens`
		);
	}

	const result: ParsedTokenArgs = {};
	if (bare.length === 1) result.cliToken = bare[0];
	if (Object.keys(cliTokens).length > 0) result.cliTokens = cliTokens;
	return result;
}
