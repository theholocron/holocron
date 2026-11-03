/** One flat id an old dotted name stands for, with the args it adds to that id's run. */
export interface LegacyTarget {
	/** The flat id (`lint:editorconfig`). */
	id: string;
	/** Args the old name implied: `sourceQuality.formatting` checked prettier, it never wrote, so it adds `--check` to `format`. */
	passthrough?: string[];
}
