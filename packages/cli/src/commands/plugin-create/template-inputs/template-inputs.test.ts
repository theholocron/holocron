import { describe, expect, it } from "vitest";

import { deriveDefaults } from "./template-inputs.js";

describe("deriveDefaults", () => {
	it("uppercases slug and replaces hyphens for vendorUpper", () => {
		expect(deriveDefaults({ slug: "clerk", vendorName: "Clerk", capability: "auth" }).vendorUpper).toBe("CLERK");
		expect(deriveDefaults({ slug: "my-vendor", vendorName: "MyVendor", capability: "auth" }).vendorUpper).toBe(
			"MY_VENDOR"
		);
	});

	it("builds capabilityClass as VendorCapability in PascalCase", () => {
		expect(deriveDefaults({ slug: "clerk", vendorName: "Clerk", capability: "auth" }).capabilityClass).toBe(
			"ClerkAuth"
		);
		expect(deriveDefaults({ slug: "neon", vendorName: "Neon", capability: "storage" }).capabilityClass).toBe(
			"NeonStorage"
		);
		expect(
			deriveDefaults({ slug: "posthog", vendorName: "PostHog", capability: "analytics" }).capabilityClass
		).toBe("PostHogAnalytics");
	});

	it("builds tokenEnv as HOLOCRON_<VENDOR>_TOKEN", () => {
		expect(deriveDefaults({ slug: "clerk", vendorName: "Clerk", capability: "auth" }).tokenEnv).toBe(
			"HOLOCRON_CLERK_TOKEN"
		);
		expect(deriveDefaults({ slug: "my-vendor", vendorName: "MyVendor", capability: "auth" }).tokenEnv).toBe(
			"HOLOCRON_MY_VENDOR_TOKEN"
		);
	});

	it("always sets transport to rest", () => {
		expect(deriveDefaults({ slug: "clerk", vendorName: "Clerk", capability: "auth" }).transport).toBe("rest");
	});
});
