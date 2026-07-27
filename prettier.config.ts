import theholocron from "@theholocron/prettier-config";
import type { Config } from "prettier";

const config = {
	...theholocron,
} satisfies Config;

export default config;
