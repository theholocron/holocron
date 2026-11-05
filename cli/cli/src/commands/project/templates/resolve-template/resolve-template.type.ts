import type { BoardTemplate } from "../../../../plugin/index.js";

/** What {@link resolveTemplate} made: the whole template, or why it could not. */
export type ResolveTemplateResult = { ok: true; template: BoardTemplate } | { ok: false; problems: string[] };
