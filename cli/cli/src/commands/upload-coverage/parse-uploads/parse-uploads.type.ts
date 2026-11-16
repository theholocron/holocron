import type { CoverageUploadGroup } from "../../../plugin/index.js";

/** What {@link parseUploads} made of `--uploads`. */
export type ParsedUploads = { ok: true; uploads: CoverageUploadGroup[] } | { ok: false; message: string };
