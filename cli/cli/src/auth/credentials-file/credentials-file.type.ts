/**
 * The file {@link writeCredentialsFile} wrote: its device and inode, and an open descriptor for it. The descriptor is
 * held until cleanup, so the inode cannot be freed and handed to some other file, which makes comparing device and inode
 * a sound way to tell this file from one that has since taken its path. Whoever receives it must give it to
 * {@link shredFile}, or close `fd`.
 */
export interface FileIdentity {
	dev: number;
	ino: number;
	/** An open, writable descriptor for the file, used to overwrite its contents wherever the path points by then. */
	fd: number;
}

/**
 * What {@link shredFile} did: `deleted` the file it was told about, found it `missing` (already gone), or left the
 * path alone because it is no longer that file (`replaced`: another process swapped it, or it is not a regular file).
 */
export type ShredOutcome = "deleted" | "missing" | "replaced";
