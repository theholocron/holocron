/** What {@link resolveExportDir} needs. */
export interface ResolveExportDirInput {
	/** The absolute repo root. */
	repoRoot: string;
	/** The provider's name; its folder under the parent. */
	provider: string;
	/** The provider's collection and environment files, relative to `repoRoot`. */
	files: string[];
	/** `--out`: the parent folder (absolute, or relative to `repoRoot`). Defaults to `.export` next to the first file. */
	out?: string;
}

/** Where an export goes, or why it may not go there. */
export type ResolvedExportDir = { ok: true; dir: string } | { ok: false; message: string };
