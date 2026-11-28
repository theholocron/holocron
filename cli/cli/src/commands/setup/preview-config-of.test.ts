import { describe, expect, it } from "vitest";

import type { ResolvedHolocronConfig } from "../../config/index.js";
import { previewConfigOf } from "./preview-config-of.js";

const configOf = (tasks: unknown[]): ResolvedHolocronConfig =>
	({ org: "acme", domain: "acme.dev", tasks }) as unknown as ResolvedHolocronConfig;

const preview = { project: "acme-preview", domain: "preview.acme.dev" };

describe("previewConfigOf", () => {
	it.each([
		"deploy",
		"deploy-docs",
		"deploy-components",
		"delivery.deploy",
		"knowledge.docs",
		"knowledge.components",
	])("reads the preview block of the %s task", (name) => {
		expect(previewConfigOf(configOf([{ name, with: { preview } }]))).toEqual(preview);
	});

	it("derives the project and domain from the org when preview is true", () => {
		expect(previewConfigOf(configOf([{ name: "deploy", with: { preview: true } }]))).toEqual({
			project: "acme-preview",
			domain: "preview.acme.dev",
		});
	});

	it("is null for a task that deploys nothing, a bare string entry and a task without inputs", () => {
		expect(previewConfigOf(configOf([{ name: "build", with: { preview } }]))).toBeNull();
		expect(previewConfigOf(configOf(["deploy"]))).toBeNull();
		expect(previewConfigOf(configOf([{ name: "deploy" }]))).toBeNull();
		expect(previewConfigOf(configOf([]))).toBeNull();
	});
});
