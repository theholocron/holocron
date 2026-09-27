import { setProjectAnnotations } from "@storybook/react";

import { storybookConfig } from "./main.js";
import { initialize as initMSW, preview as storybookPreview } from "./preview.js";
import { storybookTestRunner } from "./test-runner.js";

export type { StorybookConfig } from "./main.js";
export type { Preview } from "./preview.js";

const config: {
	initMSW: typeof initMSW;
	setProjectAnnotations: typeof setProjectAnnotations;
	storybookConfig: typeof storybookConfig;
	storybookPreview: typeof storybookPreview;
	storybookTestRunner: typeof storybookTestRunner;
} = {
	initMSW,
	setProjectAnnotations,
	storybookConfig,
	storybookPreview,
	storybookTestRunner,
};

export default config;
