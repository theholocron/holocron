import { readFileSync } from "node:fs";

/** Rollup/Vite plugin: transform *.yml and *.md imports into default-exported strings. */
export function rawYml() {
	return {
		name: "raw-yml",
		transform(_code: string, id: string) {
			if (!id.endsWith(".yml") && !id.endsWith(".md")) return null;
			return {
				code: `export default ${JSON.stringify(readFileSync(id, "utf8"))};`,
				map: null,
			};
		},
	};
}
