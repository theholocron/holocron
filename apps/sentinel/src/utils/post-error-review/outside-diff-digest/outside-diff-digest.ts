import { createHash } from "node:crypto";

import type { ReviewFinding } from "../post-error-review.type.js";

/**
 * A short, order-independent fingerprint of the findings that sit outside a pull request's diff. They cannot be
 * inline comments, so they live only in a review's body, and the digest in that body is how a later run tells that
 * the list is the same and posts nothing (holocron#1950).
 */
export function outsideDiffDigest(findings: ReviewFinding[]): string {
	const lines = findings.map((f) => `${f.file}:${f.line}:${f.body}`).sort();
	return createHash("sha1").update(lines.join("\n")).digest("hex").slice(0, 12);
}
