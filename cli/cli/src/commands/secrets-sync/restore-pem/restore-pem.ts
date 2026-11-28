/** A PEM block written on one line: the begin marker, the body, the end marker, with spaces between them. */
const COLLAPSED = /^(-----BEGIN [A-Z0-9 ]+-----) ([\s\S]+?) (-----END [A-Z0-9 ]+-----)$/;

/** Base64 lines in a PEM are 64 characters wide. */
const LINE_WIDTH = 64;

/**
 * Put a PEM back on its lines when its line breaks were turned into spaces. A key pasted into a single-line field
 * (a 1Password Environment variable, a form) arrives as `-----BEGIN ... KEY----- MIIE... -----END ... KEY-----`, which
 * Node's crypto, OpenSSL and `actions/create-github-app-token` refuse (`DECODER routines::unsupported`). The header and
 * footer go on their own lines and the body is cut into 64-character lines.
 *
 * Anything else is returned as it came: a PEM already on its lines, a value that is not a PEM, a block whose end marker
 * does not match its begin marker, and a legacy encrypted key (its body holds `Proc-Type:` header fields, whose own
 * line breaks cannot be rebuilt). Running it twice gives the same result as running it once.
 */
export function restorePem(value: string): string {
	const match = COLLAPSED.exec(value.trim());
	if (!match) return value;
	const [, begin, body, end] = match as unknown as [string, string, string, string];
	if (begin.replace("BEGIN", "END") !== end || body.includes(":")) return value;
	const lines = body.replace(/\s+/g, "").match(new RegExp(`.{1,${LINE_WIDTH}}`, "g"));
	return lines ? `${begin}\n${lines.join("\n")}\n${end}\n` : value;
}
