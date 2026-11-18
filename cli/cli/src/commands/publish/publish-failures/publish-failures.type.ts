/** A package a steady-state publish could not put on npm. */
export interface PublishFailure {
	name: string;
	version: string;
	/** `tlog-conflict`: a sigstore 409 on every try, the tarball is identical to one already logged. */
	kind: "failed" | "tlog-conflict";
	message: string;
}
