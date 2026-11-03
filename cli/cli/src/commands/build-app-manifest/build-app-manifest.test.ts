import { describe, expect, it } from "vitest";

import { buildAppManifest } from "./build-app-manifest.js";

const base = {
	description: "d",
	url: "https://example.test",
	default_permissions: { contents: "write", metadata: "read" },
	default_events: ["push", "pull_request"],
};
const input = {
	base,
	name: "The App - dev",
	webhookUrl: "https://t.example/api/webhook",
	redirectUrl: "http://127.0.0.1:1/callback",
};

describe("buildAppManifest", () => {
	it("adds the name, the webhook and the redirect to the shared part, private by default", () => {
		expect(buildAppManifest(input)).toEqual({
			name: "The App - dev",
			description: "d",
			url: "https://example.test",
			public: false,
			redirect_url: "http://127.0.0.1:1/callback",
			hook_attributes: { url: "https://t.example/api/webhook", active: true },
			default_permissions: { contents: "write", metadata: "read" },
			default_events: ["push", "pull_request"],
		});
	});

	it("leaves out a description and homepage the file does not have, and keeps public: true", () => {
		const manifest = buildAppManifest({
			...input,
			base: { default_permissions: {}, default_events: [], public: true },
		});
		expect("description" in manifest).toBe(false);
		expect("url" in manifest).toBe(false);
		expect(manifest.public).toBe(true);
	});

	it.each([
		["a manifest that is not an object", [], /JSON object/],
		[
			"permissions that are not names to access",
			{ default_permissions: { a: 1 }, default_events: [] },
			/default_permissions/,
		],
		["no permissions", { default_events: [] }, /default_permissions/],
		["events that are not names", { default_permissions: {}, default_events: [1] }, /default_events/],
		["no events", { default_permissions: {} }, /default_events/],
	])("refuses %s", (_label, bad, message) => {
		expect(() => buildAppManifest({ ...input, base: bad })).toThrow(message);
	});

	it("refuses a webhook that is not a URL, or not https", () => {
		expect(() => buildAppManifest({ ...input, webhookUrl: "nope" })).toThrow(/not a URL/);
		expect(() => buildAppManifest({ ...input, webhookUrl: "http://t.example/x" })).toThrow(/must be https/);
	});
});
