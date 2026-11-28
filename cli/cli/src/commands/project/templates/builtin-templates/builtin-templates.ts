import type { BoardTemplate } from "../../../../plugin/index.js";
import { ROADMAP_TEMPLATE } from "../roadmap/index.js";
import { SPRINT_TEMPLATE } from "../sprint/index.js";

/** The templates that ship in `@theholocron/cli`, by name. A repo's own template with the same name replaces one. */
export const BUILTIN_TEMPLATES: Readonly<Record<string, BoardTemplate>> = {
	roadmap: ROADMAP_TEMPLATE,
	sprint: SPRINT_TEMPLATE,
};
