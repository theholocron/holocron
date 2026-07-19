import { INITIAL_VIEWPORTS } from "@storybook/addon-viewport";
import { type Preview } from "@storybook/react";
import { mswLoader } from "msw-storybook-addon";
export { initialize } from "msw-storybook-addon";

export type { Preview };

// `layout` is valid storybook v9 runtime config but absent from
// ProjectAnnotations<ReactRenderer> in the type definitions — cast to accept it.
export const preview = {
	layout: "centered",
	loaders: [mswLoader],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		html: {
			prettier: {
				tabWidth: 4,
				useTabs: true,
			},
		},
		viewport: {
			viewports: INITIAL_VIEWPORTS,
			// defaultViewport: 'ipad',
		},
	},
	tags: ["autodocs"],
} as unknown as Preview;
