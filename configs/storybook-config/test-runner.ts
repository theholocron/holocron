import { checkA11y, injectAxe } from "axe-playwright";
import { type Page } from "playwright";

export const storybookTestRunner = {
	async preVisit(page: Page): Promise<void> {
		await injectAxe(page);
	},
	async postVisit(page: Page): Promise<void> {
		await checkA11y(page, "#storybook-root", {
			detailedReport: true,
			detailedReportOptions: {
				html: true,
			},
		});
	},
};
