import { describe, expect, it } from "vitest";

import { appManifestPage } from "./app-manifest-page.js";

const manifest = {
	name: `A "quoted" <App> & 'co'`,
	redirect_url: "http://127.0.0.1:1/callback",
	hook_attributes: { url: "https://t.example/hook", active: true as const },
	default_permissions: {},
	default_events: [],
};

describe("appManifestPage", () => {
	it("posts the manifest to the action, with everything escaped", () => {
		const page = appManifestPage("https://github.com/x?a=1&state=2", manifest);
		expect(page).toContain('action="https://github.com/x?a=1&amp;state=2"');
		expect(page).toContain('name="manifest"');
		expect(page).toContain("&quot;redirect_url&quot;");
		// Nothing from the name is left raw in the markup.
		expect(page).not.toContain("<App>");
		expect(page).toContain("&lt;App&gt;");
		expect(page).toContain("&#39;co&#39;");
	});

	it("submits itself, with a button for a browser that blocks the script", () => {
		const page = appManifestPage("https://github.com/x", manifest);
		expect(page).toContain('document.getElementById("form").submit()');
		expect(page).toContain('<button type="submit">');
	});
});
