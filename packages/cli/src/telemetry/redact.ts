/**
 * Token-shape scrubbing for telemetry payloads — a raw token never leaves the
 * process, even when a value is controlled. Regex-on-the-serialised-string
 * (matches a token shape *anywhere*), distinct from `@theholocron/logger`'s
 * field-path redaction. Shared by {@link scrubError} (Sentry `beforeSend`) and
 * the PostHog `event()` path.
 */

const TOKEN_RE = /\b(ghp_|ghs_|glpat-|xoxb-|xoxp-|npm_|sk-|[A-Z][A-Z0-9_]{2,}_TOKEN[=\s])[^\s"]*/g;

/** Replace token-shaped substrings in a string with `[REDACTED]`. */
export function redact(raw: string): string {
	return raw.replace(TOKEN_RE, "[REDACTED]");
}

/** Deep-scrub every string in an object by round-tripping through {@link redact}. */
export function redactObject<T>(value: T): T {
	return JSON.parse(redact(JSON.stringify(value))) as T;
}
