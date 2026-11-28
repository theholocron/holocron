import type { Capability } from "../../config/compose/index.js";

/**
 * Adds TypeScript type-checking to a repo. Marked `required` — `holocron setup`
 * derives the `Typecheck / Conclusion` branch-protection check from the manifest.
 * Requires: node
 */
export function typecheck(): Capability {
	return {
		id: "typecheck",
		requires: ["node"],
		tasks: [{ name: "typecheck", required: true }],
	};
}
