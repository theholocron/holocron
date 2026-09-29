import { library } from "@theholocron/eslint-config/bundles/library";
import type { Linter } from "eslint";

const config = [...library()] satisfies Linter.Config[];

export default config;
