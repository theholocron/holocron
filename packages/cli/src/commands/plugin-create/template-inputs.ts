/**
 * Shared input record for every template module.
 *
 * Every template exports `(inputs: TemplateInputs) => string` and reads
 * from this record. Keeping the surface small + typechecked lets the
 * templates stay dumb string builders while the command layer handles
 * normalization + defaulting from user input.
 */

import type { CapabilityKey } from "../../capabilities/index.js";

export interface TemplateInputs {
	/** Package slug — e.g., "clerk". Lowercase, kebab-case. */
	slug: string;
	/** Vendor display name — e.g., "Clerk". PascalCase. */
	vendorName: string;
	/** Vendor slug UPPERCASED — e.g., "CLERK". Used for env var names + class prefixes. */
	vendorUpper: string;
	/** Capability the plugin implements — one of the 14 known keys. */
	capability: CapabilityKey;
	/** Capability implementation class name — e.g., "ClerkAuth". PascalCase. */
	capabilityClass: string;
	/** Holocron-namespaced env var — defaults to `HOLOCRON_<VENDOR_UPPER>_TOKEN`. */
	tokenEnv: string;
	/** Vendor-native env var — e.g., "CLERK_SECRET_KEY". */
	vendorEnv: string;
	/** REST base URL — e.g., "https://api.clerk.com/v1". */
	baseUrl: string;
	/** Transport. Only "rest" is supported in Phase 1 (spec: #77). */
	transport: "rest";
}

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
