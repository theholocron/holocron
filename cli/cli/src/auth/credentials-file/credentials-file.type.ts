/** Which file a path named when it was written: its device and inode. Cleanup only touches a file that still matches. */
export interface FileIdentity {
	dev: number;
	ino: number;
}

/**
 * What {@link shredFile} did: `deleted` the file it was told about, found it `missing` (already gone), or left it
 * alone because the path is no longer that file (`replaced`: another process swapped it, or it is not a regular file).
 */
export type ShredOutcome = "deleted" | "missing" | "replaced";
