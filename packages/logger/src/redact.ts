/**
 * Sensitive field paths stripped from every log line before any transport —
 * pino-pretty, CI stdout, and Axiom alike. Redaction happens in Pino's
 * serialisation layer, so a raw token never leaves the process.
 *
 * Paths use Pino's redaction syntax: dotted access, `[*]` wildcards for
 * arrays, and bracket-quoted keys for names that are not valid identifiers.
 *
 * @see https://getpino.io/#/docs/redaction
 */
export const REDACTED_PATHS: readonly string[] = [
	"token",
	"secret",
	"password",
	"apiKey",
	"secrets[*].value",
	"headers.authorization",
	'headers["x-api-key"]',
	// Same keys, one level down — the common `{ err: { config: { headers } } }`
	// and `{ context: { token } }` shapes.
	"*.token",
	"*.secret",
	"*.password",
	"*.apiKey",
];

/** Replacement string Pino writes in place of a redacted value. */
export const REDACT_CENSOR = "[Redacted]";

/** Ready-to-use Pino `redact` option. */
export const redactOptions = {
	paths: [...REDACTED_PATHS],
	censor: REDACT_CENSOR,
} as const;
