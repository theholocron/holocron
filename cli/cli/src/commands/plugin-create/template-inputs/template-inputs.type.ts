import type { CapabilityKey } from "../../../plugin/index.js";

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
