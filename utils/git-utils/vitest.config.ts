import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

export default defineConfig(library({ globals: true }) as never);
