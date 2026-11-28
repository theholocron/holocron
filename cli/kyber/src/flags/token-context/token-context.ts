import { type ParsedTokenArgs, parseTokenArgs, TokenParseError } from "../../secrets/token-args/index.js";

/**
 * Parses the values of a repeatable `--token` flag. An empty or missing flag is `{}`. A value that does not parse is
 * reported through `report` (as `--token: <why>`), sets `process.exitCode` to 1 and gives `null`, so the command can stop
 * without a stack trace; any other error is thrown.
 */
export function tokenContext(
	rawTokens: string[] | undefined,
	report: (message: string) => void
): ParsedTokenArgs | null {
	if (!rawTokens?.length) return {};
	try {
		return parseTokenArgs(rawTokens);
	} catch (err) {
		if (err instanceof TokenParseError) {
			report(`--token: ${err.message}`);
			process.exitCode = 1;
			return null;
		}
		throw err;
	}
}
