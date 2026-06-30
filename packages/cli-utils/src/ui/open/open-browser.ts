import defaultBrowser from "default-browser";
import open, { apps } from "open";

/**
 * Opens an application if the user confirms.
 *
 * @param {string} name - The name of the application.
 * @returns {Promise<void>} - A promise that resolves to a tuple containing an error (if any), a boolean indicating if the app was opened, and the time taken to perform the operation.
 */
export async function openBrowser(url: string): Promise<void> {
	if (!url) {
		throw new Error("No URL was provided!");
	}

	let browser = apps.browser;
	const { name } = await defaultBrowser();
	const supported = ["chrome", "firefox", "edge"];
	if (!supported.includes(name.toLowerCase())) {
		browser = apps.chrome;
	}

	await open(url, {
		app: { name: browser },
	});
}
