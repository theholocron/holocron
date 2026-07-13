import { google, type docs_v1 } from "googleapis";
import { googleAuth } from "./authentication.js";
import type { Return } from "./types.js";

const docs = google.docs("v1");

async function getDocument(
	id: string,
): Promise<Return<docs_v1.Schema$Document>> {
	if (!id) {
		return [new Error("No ID was provided!"), null, 0];
	}

	const start = performance.now();
	const authClient = await googleAuth([
		"https://www.googleapis.com/auth/documents.readonly",
	]);

	try {
		const response = await docs.documents.get({
			auth: authClient,
			documentId: id,
		});

		return [null, response.data, performance.now() - start];
	} catch (error) {
		return [error as Error, null, performance.now() - start];
	}
}

export const documents = {
	get: getDocument,
};
