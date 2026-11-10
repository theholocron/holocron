import type { PackageJsonLike, StackName } from "../derived-properties/index.js";
import { deriveStack, KNOWN_STACK_DEPS } from "../derived-properties/index.js";

/**
 * The stack of a whole repo: `deriveStack()` of the root `package.json` and of
 * every workspace package's, unioned (in `KNOWN_STACK_DEPS` order, no repeats).
 * A repo with no readable `package.json` has no stack.
 */
export function deriveRepoStack(
	rootPackageJson: PackageJsonLike | null,
	workspacePackageJsons: readonly PackageJsonLike[]
): StackName[] {
	const found = new Set([rootPackageJson, ...workspacePackageJsons].flatMap((pkg) => deriveStack(pkg)));
	return KNOWN_STACK_DEPS.filter((name) => found.has(name));
}
