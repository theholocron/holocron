const HIDDEN = "«hidden»";

/** Shapes that are credentials wherever they appear: a Discord webhook URL, a bearer header, a Sentry token. */
const SHAPES = [
	/https:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/g,
	/\bBearer\s+[\w.~+/=-]+/gi,
	/\bsntry[a-z]_[\w+/=-]+/g,
];

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Returns a function that replaces secrets in a line of output: every value the caller gave (a token, a signing secret)
 * and every string shaped like a credential. Values shorter than 6 characters are left, since replacing `ab` would
 * mangle ordinary words. `secrets` may grow after this is called; it is read on each use.
 */
export function createScrubber(secrets: Iterable<string>): (text: string) => string {
	return (text) => {
		let out = text;
		const known = [...secrets].filter((s) => s.length >= 6).sort((a, b) => b.length - a.length);
		for (const secret of known) out = out.replace(new RegExp(escape(secret), "g"), HIDDEN);
		for (const shape of SHAPES) out = out.replace(shape, HIDDEN);
		return out;
	};
}
