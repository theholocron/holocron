import type { BoardTemplateFile } from "../../../../plugin/index.js";

/** What {@link validateTemplateFile} found: the file, typed, or every problem with it. */
export type ValidateTemplateResult = { ok: true; file: BoardTemplateFile } | { ok: false; problems: string[] };
