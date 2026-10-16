export interface PublicPackageEntry {
	name: string;
	version: string;
	/** `pnpm --filter` target: `.` for a single-package repo, `./packages/<dir>` for a monorepo workspace. */
	dir: string;
}
