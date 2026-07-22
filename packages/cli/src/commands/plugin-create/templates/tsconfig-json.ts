import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	return `{
  "display": "Holocron Plugin: ${inputs.vendorName}",
  "extends": "@tsconfig/node-lts/tsconfig.json",
  "compilerOptions": {
    "baseUrl": "./",
    "outDir": "./dist",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
`;
}
