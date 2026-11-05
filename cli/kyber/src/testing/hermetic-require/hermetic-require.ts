import { realpathSync } from "node:fs";
import type * as NodeModule from "node:module";
import { dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A `createRequire` whose `resolve()` only finds modules under the directory it was created for.
 *
 * Node also resolves through `NODE_PATH`, and a test runner started by pnpm puts pnpm's hoisted
 * dependency folder there. A test that creates a temp "repo" and expects a package not to be installed
 * in it would then find the one hoisted for the real workspace, and its result would depend on what
 * the workspace happens to link (a package that becomes a workspace dependency turns up there).
 *
 * Use it in a test that exercises "is this package installed in that repo":
 *
 *   vi.mock("node:module", async (importOriginal) => {
 *     const actual = await importOriginal<typeof import("node:module")>();
 *     const { hermeticCreateRequire } = await import("../../testing/hermetic-require.js");
 *     return { ...actual, createRequire: hermeticCreateRequire(actual) };
 *   });
 */
export function hermeticCreateRequire(
	actual: Pick<typeof NodeModule, "createRequire">
): typeof NodeModule.createRequire {
	return ((from: string | URL) => {
		const real = actual.createRequire(from);
		const file = typeof from === "string" && !from.startsWith("file:") ? from : fileURLToPath(from);
		let root = dirname(file);
		try {
			root = realpathSync(root);
		} catch {
			// the directory does not exist: nothing can resolve under it
		}
		const resolve = (id: string, options?: { paths?: string[] }): string => {
			const found = real.resolve(id, options);
			if (found !== root && !found.startsWith(root + sep)) {
				throw Object.assign(new Error(`Cannot find module '${id}' under ${root}`), {
					code: "MODULE_NOT_FOUND",
				});
			}
			return found;
		};
		return Object.assign((id: string) => real(id), real, { resolve: Object.assign(resolve, real.resolve) });
	}) as typeof NodeModule.createRequire;
}
