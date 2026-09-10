/**
 * Two redaction layers, both zero-dependency:
 *
 * 1. **Field-path redaction** ({@link REDACTED_PATHS} / {@link redactOptions}) —
 *    Pino's `redact` option. Strips known-sensitive keys from every log line in
 *    Pino's serialisation layer, before any transport sees it.
 * 2. **Token-shape scrubbing** ({@link redact} / {@link redactObject}) — a
 *    regex over the serialised string that matches a token shape *anywhere*,
 *    even in a value the caller controls. Used by the Sentry `beforeSend` hook
 *    and the analytics `capture()` path.
 */

// ── 1. field-path redaction (Pino) ───────────────────────────────────────────

/**
 * Sensitive field paths stripped from every log line. Paths use Pino's
 * redaction syntax: dotted access, `[*]` wildcards for arrays, and
 * bracket-quoted keys for names that are not valid identifiers.
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

// ── 2. token-shape scrubbing (Sentry / analytics payloads) ───────────────────

const TOKEN_RE = /\b(ghp_|ghs_|glpat-|xoxb-|xoxp-|npm_|sk-|[A-Z][A-Z0-9_]{2,}_TOKEN[=\s])[^\s"]*/g;

/** Replace token-shaped substrings in a string with `[REDACTED]`. */
export function redact(raw: string): string {
	return raw.replace(TOKEN_RE, "[REDACTED]");
}

/** Deep-scrub every string in an object by round-tripping through {@link redact}. */
export function redactObject<T>(value: T): T {
	return JSON.parse(redact(JSON.stringify(value))) as T;
}
