import type { CoverageUploadGroup } from "../../../plugin/index.js";
import type { ParsedUploads } from "./parse-uploads.type.js";

const MESSAGE = 'uploads must be a JSON list of {"flag", "files"} with both set.';

/**
 * Reads `--uploads`: a JSON list of `{ "flag": "utils", "files": "utils/*\/coverage/lcov.info" }`, where `files` is a
 * glob relative to the repo root or a list of them (the action's own input takes the single glob). Anything else is a
 * message, never a throw, so the run can report it as a row.
 */
export function parseUploads(text: string): ParsedUploads {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return { ok: false, message: `${MESSAGE} It is not JSON.` };
	}
	if (!Array.isArray(value)) return { ok: false, message: MESSAGE };
	const uploads: CoverageUploadGroup[] = [];
	for (const entry of value as unknown[]) {
		const item = (typeof entry === "object" && entry !== null ? entry : {}) as { flag?: unknown; files?: unknown };
		const files = typeof item.files === "string" ? [item.files] : item.files;
		if (
			typeof item.flag !== "string" ||
			item.flag === "" ||
			!Array.isArray(files) ||
			files.length === 0 ||
			!files.every((file) => typeof file === "string" && file !== "")
		) {
			return { ok: false, message: MESSAGE };
		}
		uploads.push({ flag: item.flag, files: files as string[] });
	}
	return { ok: true, uploads };
}
