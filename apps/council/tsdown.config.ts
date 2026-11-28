import { defineConfig } from "tsdown";

/**
 * Obsidian loads `main.js`, `manifest.json` and an optional `styles.css` from `<vault>/.obsidian/plugins/<id>/`.
 * `main.js` has to be one CommonJS file that leaves `obsidian` (the app supplies it) and the Node and Electron
 * builtins to the host. The one workspace dependency, `@theholocron/env-utils/lookup` (a devDependency, so it is
 * bundled), has no side effects; nothing else is imported.
 *
 * `manifest.json` is copied next to `main.js`, so `dist/` is the folder to install.
 */
export default defineConfig({
	entry: { main: "src/main.ts" },
	format: "cjs",
	platform: "node",
	target: "es2022",
	dts: false,
	clean: true,
	outDir: "dist",
	// Obsidian loads `main.js`; tsdown's default for CommonJS in a `"type": "module"` package is `.cjs`.
	outExtensions: () => ({ js: ".js" }),
	deps: { neverBundle: ["obsidian", "electron", /^node:/, /^@codemirror\//, /^@lezer\//] },
	copy: [{ from: "manifest.json", to: "dist" }],
});
