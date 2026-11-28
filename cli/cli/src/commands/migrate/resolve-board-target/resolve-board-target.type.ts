import type { LoadedConfig } from "../../../config/index.js";
import type { BoardTemplate } from "../../../plugin/index.js";
import type { TemplatesIo } from "../../project/load-templates/index.js";

/** What {@link resolveBoardTarget} needs. */
export interface ResolveBoardTargetInput {
	/** The repo's config; `providers.projects` supplies the owner and the template directory when it sets them. */
	loaded: LoadedConfig;
	/** The owner to use when the config names none. */
	fallbackOwner: string;
	/** The repo root, which a relative template directory is read from. */
	repoRoot: string;
	/** The template to make a missing board from. Defaults to `roadmap`. */
	template?: string | undefined;
	/** Where template files are read from. Defaults to the real file system. */
	io?: TemplatesIo | undefined;
}

/** Whose board it is and what a missing one is made from, or why that cannot be settled. */
export type BoardTarget = { ok: true; owner: string; template: BoardTemplate } | { ok: false; reason: string };
