import { setProjectAnnotations } from "@storybook/react";
import { storybookConfig } from "./main.js";
import { initialize as initMSW, preview as storybookPreview } from "./preview.js";
import { storybookTestRunner } from "./test-runner.js";

export type { StorybookConfig } from "./main.js";
export type { Preview } from "./preview.js";

export default {
	initMSW,
	setProjectAnnotations,
	storybookConfig,
	storybookPreview,
	storybookTestRunner,
};
