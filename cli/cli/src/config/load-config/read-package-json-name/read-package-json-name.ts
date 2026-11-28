import { readPackageJson } from "@theholocron/pkg-utils";

/** The `name` of the `package.json` in `dir` without its scope, or `undefined`. */
export async function readPackageJsonName(dir: string): Promise<string | undefined> {
	const name = (await readPackageJson(dir))?.name;
	return name === undefined ? undefined : name.replace(/^@[^/]+\//, "");
}
