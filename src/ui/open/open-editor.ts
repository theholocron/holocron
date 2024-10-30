import openEditor from "open-editor";
import { prompt } from "@/ui";

/**
 * Opens an application if the user confirms.
 *
 * @param {string} name - The name of the application.
 * @param {string} location - The file location of the application.
 * @returns {Promise<void>}
 */
export async function openApp(location: string, name?: string, bypass: boolean = false): Promise<void> {
	if (!location) {
		throw new Error("No app location was provided!");
	}
	const open = async () =>
		await openEditor(
			[
				{
					file: location,
				},
			],
			{ wait: true }
		);

	if (!bypass) {
		await prompt.confirm(`Do you want to open ${name}?`, open);
	} else {
		open();
	}
}
