/** What Bruno's converter writes for Postman's `pm.variables.replaceIn(pm.request.body.raw)`. */
const BROKEN_BODY = "bru.interpolate(req.getBody().raw)";

/**
 * The body text a signing script has to sign. `req.getBody()` is the parsed object for a JSON body and has no `.raw`,
 * so the converter's line signs nothing; a body Bruno cannot parse before its variables are filled in (an unquoted
 * `{{number}}`) comes back as text. Both reach `bru.interpolate()` as the one string Bruno itself fills in and sends.
 *
 * Limit: a body that is itself a JSON string (`"hello"`) also comes back as a string, so it is signed without its
 * quotes. A webhook payload is always an object, and every signed body in the request files is one, so it is not handled.
 */
const BODY_TEXT = 'bru.interpolate(typeof req.getBody() === "string" ? req.getBody() : JSON.stringify(req.getBody()))';

/**
 * Repairs what the converter drops in a script that signs the request body: Postman's `pm.request.body.raw` becomes
 * `req.getBody().raw`, which is empty in Bruno, so every signature is over the wrong text and the receiver rejects the
 * request. Walks the converted collection and rewrites each script that has the line, in place.
 *
 * @param converted - A collection (or any part of one) from `postmanToBruno()`.
 */
export function repairSigningBody(converted: unknown): void {
	if (Array.isArray(converted)) {
		for (const entry of converted) repairSigningBody(entry);
		return;
	}
	if (typeof converted !== "object" || converted === null) return;
	const record = converted as Record<string, unknown>;
	for (const [key, value] of Object.entries(record)) {
		if (typeof value === "string") {
			if (value.includes(BROKEN_BODY)) record[key] = value.split(BROKEN_BODY).join(BODY_TEXT);
		} else {
			repairSigningBody(value);
		}
	}
}
