import { google, type sheets_v4 } from "googleapis";
import { googleAuth } from "./authentication.js";
import type { Return } from "./types.js";

const sheets = google.sheets("v4");

async function getSpreadsheet(
	id: string,
): Promise<Return<sheets_v4.Schema$Spreadsheet>> {
	if (!id) {
		return [new Error("No ID was provided!"), null, 0];
	}

	const start = performance.now();
	const authClient = await googleAuth([
		"https://www.googleapis.com/auth/spreadsheets.readonly",
	]);

	try {
		const response = await sheets.spreadsheets.get({
			auth: authClient,
			spreadsheetId: id,
			includeGridData: true,
		});

		return [null, response.data, performance.now() - start];
	} catch (error) {
		return [error as Error, null, performance.now() - start];
	}
}

export const spreadsheets = {
	get: getSpreadsheet,
};
