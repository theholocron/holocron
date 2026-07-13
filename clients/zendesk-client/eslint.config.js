import { library } from "@theholocron/eslint-config/bundles/library";

/** @type {import("eslint").Linter.Config} */
const config = [...library()];

export default config;
