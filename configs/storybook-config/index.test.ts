import { vi, describe, it, expect, beforeAll } from "vitest";

// Mock all peer deps before the module under test is imported.
// vi.mock calls are hoisted by vitest so the factories run before any import.
vi.mock("@storybook/react", () => ({ setProjectAnnotations: vi.fn() }));
vi.mock("@storybook/react-vite", () => ({}));
vi.mock("@storybook/addon-viewport", () => ({ INITIAL_VIEWPORTS: {} }));
vi.mock("msw-storybook-addon", () => ({
	mswLoader: vi.fn(),
	initialize: vi.fn(),
}));
vi.mock("playwright", () => ({}));
vi.mock("axe-playwright", () => ({ injectAxe: vi.fn(), checkA11y: vi.fn() }));

describe("storybook-config", () => {
	let config: Awaited<typeof import("./index.js")>["default"];

	beforeAll(async () => {
		const mod = await import("./index.js");
		config = mod.default;
	});

	it("exports a default object", () => {
		expect(typeof config).toBe("object");
		expect(config).not.toBeNull();
	});

	it("exports storybookConfig with addons and framework", () => {
		expect(typeof config.storybookConfig).toBe("object");
		expect(Array.isArray(config.storybookConfig.addons)).toBe(true);
		expect(config.storybookConfig.framework?.name).toBe(
			"@storybook/react-vite",
		);
	});

	it("exports storybookPreview with layout and parameters", () => {
		expect(typeof config.storybookPreview).toBe("object");
		expect(config.storybookPreview.layout).toBe("centered");
	});

	it("exports storybookTestRunner with preVisit and postVisit hooks", () => {
		expect(typeof config.storybookTestRunner.preVisit).toBe("function");
		expect(typeof config.storybookTestRunner.postVisit).toBe("function");
	});

	it("exports setProjectAnnotations and initMSW functions", () => {
		expect(typeof config.setProjectAnnotations).toBe("function");
		expect(typeof config.initMSW).toBe("function");
	});
});
