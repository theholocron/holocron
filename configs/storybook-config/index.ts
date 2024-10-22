import { setProjectAnnotations } from "@storybook/react";
import { storybookConfig } from "./main";
import { initialize as initMSW, storybookPreview } from "./preview";
import { storybookTestRunner } from "./test-runner";

export type { StorybookConfig } from "./main";
export type { Preview } from "./preview";

export default {
	initMSW,
	setProjectAnnotations,
	storybookConfig,
	storybookPreview,
	storybookTestRunner,
};
