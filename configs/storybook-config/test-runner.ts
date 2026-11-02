import { checkA11y, injectAxe } from "axe-playwright";
import { type Page } from "playwright";

/** Storybook test-runner hooks that run an accessibility check on every story. */
export const storybookTestRunner = {
	/** Injects axe into the page before the story is visited. */
	async preVisit(page: Page): Promise<void> {
		await injectAxe(page);
	},
	/** Checks the story's root for accessibility violations after the story is visited. */
	async postVisit(page: Page): Promise<void> {
		await checkA11y(page, "#storybook-root", {
			detailedReport: true,
			detailedReportOptions: {
				html: true,
			},
		});
	},
};
