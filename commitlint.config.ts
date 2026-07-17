import type { UserConfig } from "@commitlint/types";

const config = {
	extends: ["@theholocron"],
	rules: {
		"footer-max-line-length": [0],
	},
} satisfies UserConfig;

export default config;
