import type { Config } from "prettier";
import theholocron from "@theholocron/prettier-config";

const config = {
	...theholocron,
} satisfies Config;

export default config;
