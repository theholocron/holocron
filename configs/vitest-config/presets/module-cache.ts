/**
 * Where a package keeps Vitest's module cache, relative to the package. Vitest's default is one directory shared by
 * every package in the workspace, and when the lockfile changes each Vitest process clears it while the others are
 * writing into it, which crashes some of them at startup (`ENOTEMPTY: rmdir node_modules/.vitest-cache`). One
 * directory per package means no process ever clears one another process uses.
 */
export const MODULE_CACHE_PATH = "node_modules/.vitest-cache";
