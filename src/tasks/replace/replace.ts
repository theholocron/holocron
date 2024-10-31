import { type CLIOptions } from "@/cli";
import { type Return } from "@/types";
import { $, log } from "@/utils";

const FN = "find.replace";

/**
 * Perform a case-sensitive replacement in a string, keeping the casing format of each found instance.
 *
 * @param {string} text - The text in which to perform the replacement.
 * @param {string} searchTerm - The term to search for, ignoring case.
 * @param {string} replacement - The replacement term.
 * @returns {string} - The updated text with replacements made.
 */
function replaceWithRespectToCase(text: string, searchTerm: string, replacement: string): string {
	// Create a regex to match search term with flexible spacing/hyphens between words
	const words = searchTerm.split(/[- ]/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); // Escape special chars
	const regex = new RegExp(words.join("[- ]?"), "gi"); // Allow for spaces or hyphens between words

	return text.replace(regex, (match) => {
		// Transform replacement to match the case of the original found match
		const replacementWords = replacement.split(/[- ]/);
		const transformed = match
			.split(/[- ]/)
			.map((word, index) => {
				const replacementWord = replacementWords[index] || ""; // Handle possible extra words in replacement
				return /[A-Z]/.test(word[0])
					? replacementWord.charAt(0).toUpperCase() + replacementWord.slice(1)
					: replacementWord.toLowerCase();
			})
			.join(" ");

		return transformed.trim();
	});
}

/**
 * Update a specific string in multiple files.
 *
 * @param {string[]} filePaths - An array of file paths to be updated.
 * @param {string} searchTerm - The base string to match.
 * @param {string} replacement - The new string to replace with.
 * @param {CLIOptions} [options={}] - CLI options for logging and additional processing.
 * @returns {Promise<Return<string[]>>} - A promise that resolves to a tuple containing an error (if any), an object with the update status for each domain, and the time taken.
 */
export async function findReplace(
	filePaths: string[],
	searchTerm: string,
	replacement: string,
	options: CLIOptions = {}
): Promise<Return<string[]>> {
	if (!filePaths || !Array.isArray(filePaths)) {
		return [new Error("No file paths were provided!"), null, 0];
	}

	if (!searchTerm) {
		return [new Error("No search term was provided!"), null, 0];
	}

	if (!replacement) {
		return [new Error("No replacement was provided!"), null, 0];
	}

	const start = performance.now();
	const output: string[] = [];

	for (const filePath of filePaths) {
		log.process(FN, `Searching ${filePath} for occurrences of "${searchTerm}"`, options);

		try {
			// Read the file content
			const [fileErr, file] = await $.file(filePath);
			if (fileErr || !file?.content) {
				log.info(FN, `Cannot read file ${filePath}: skipping`, options);
				continue;
			}

			// Perform the replacement
			const updatedData = replaceWithRespectToCase(file.content, searchTerm, replacement);

			// Write back only if the content changed
			if (updatedData !== file.content) {
				await $.file(filePath, updatedData, true); // Ensure this function overwrites the file content
				output.push(filePath);
				log.process(FN, `Updated ${filePath}`, options);
			} else {
				log.process(FN, `No changes in ${filePath}`, options);
			}
		} catch (error) {
			log.error(FN, `Error processing file ${filePath}: ${(error as Error).message}`, options);
		}
	}

	return [null, output, performance.now() - start];
}
