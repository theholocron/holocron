import { type Page } from "playwright";
import { injectAxe, checkA11y } from "axe-playwright";

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
