import { readFileSync } from "node:fs";

/** Rollup/Vite plugin: transform *.yml imports into default-exported strings. */
export function rawYml() {
	return {
		name: "raw-yml",
		transform(_code: string, id: string) {
			if (!id.endsWith(".yml")) return null;
			return {
				code: `export default ${JSON.stringify(readFileSync(id, "utf8"))};`,
				map: null,
			};
		},
	};
}
