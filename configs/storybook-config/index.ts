import { setProjectAnnotations } from "@storybook/react";

import { storybookConfig } from "./main.js";
import { initialize as initMSW, preview as storybookPreview } from "./preview.js";
import { storybookTestRunner } from "./test-runner.js";

export type { StorybookConfig } from "./main.js";
export type { Preview } from "./preview.js";

/** The Storybook helpers bundled in one object: MSW setup, `setProjectAnnotations`, the main config, the preview and the test runner config. */
const config: {
	/** Initialises Mock Service Worker for Storybook. */
	initMSW: typeof initMSW;
	/** Storybook's `setProjectAnnotations`, which applies the project's preview annotations (for example in tests). */
	setProjectAnnotations: typeof setProjectAnnotations;
	/** The shared Storybook main config. */
	storybookConfig: typeof storybookConfig;
	/** The shared Storybook preview config. */
	storybookPreview: typeof storybookPreview;
	/** The shared Storybook test-runner config. */
	storybookTestRunner: typeof storybookTestRunner;
} = {
	initMSW,
	setProjectAnnotations,
	storybookConfig,
	storybookPreview,
	storybookTestRunner,
};

export default config;
