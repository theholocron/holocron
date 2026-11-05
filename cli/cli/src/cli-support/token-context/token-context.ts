import { tokenContext as parseTokenContext } from "@theholocron/kyber/flags";
import { type ParsedTokenArgs } from "@theholocron/kyber/secrets";

import { reportError } from "../../observability/logger/index.js";

/** Parses --token values and returns the context spread, or null on parse error (exits with code 1). */
export function tokenContext(rawTokens: string[] | undefined): ParsedTokenArgs | null {
	return parseTokenContext(rawTokens, reportError);
}
