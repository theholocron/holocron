/**
 * Shared input record for every template module.
 *
 * Every template exports `(inputs: TemplateInputs) => string` and reads
 * from this record. Keeping the surface small + typechecked lets the
 * templates stay dumb string builders while the command layer handles
 * normalization + defaulting from user input.
 */

import type { CapabilityKey } from "../../../plugin/index.js";
import type { TemplateInputs } from "./template-inputs.type.js";

/** Derive the standard defaults from a slug + vendor name. */
export function deriveDefaults(input: {
	slug: string;
	vendorName: string;
	capability: CapabilityKey;
}): Pick<TemplateInputs, "vendorUpper" | "capabilityClass" | "tokenEnv" | "transport"> {
	const vendorUpper = input.slug.toUpperCase().replace(/-/g, "_");
	const capability = input.capability;
	const capabilityClass = `${input.vendorName}${capability.charAt(0).toUpperCase() + capability.slice(1)}`;
	return {
		vendorUpper,
		capabilityClass,
		tokenEnv: `HOLOCRON_${vendorUpper}_TOKEN`,
		transport: "rest",
	};
}
