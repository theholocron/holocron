import { type ParsedTokenArgs, parseTokenArgs, TokenParseError } from "../../auth/index.js";
import { reportError } from "../../observability/logger/index.js";

/** Parses --token values and returns the context spread, or null on parse error (exits with code 1). */
export function tokenContext(rawTokens: string[] | undefined): ParsedTokenArgs | null {
	if (!rawTokens?.length) return {};
	try {
		return parseTokenArgs(rawTokens);
	} catch (err) {
		if (err instanceof TokenParseError) {
			reportError(`--token: ${err.message}`);
			process.exitCode = 1;
			return null;
		}
		throw err;
	}
}
