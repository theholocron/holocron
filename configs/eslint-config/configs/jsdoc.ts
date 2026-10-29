import jsdoc from "eslint-plugin-jsdoc";
import type { Linter } from "eslint";

export function jsdocConfig(): Linter.Config[] {
	return [
		{
			...(jsdoc.configs["flat/recommended-typescript"] as Linter.Config),
			name: "@theholocron/jsdoc/recommended",
		},
		{
			name: "@theholocron/jsdoc",
			rules: {
				"jsdoc/require-jsdoc": [
					"error",
					{
						publicOnly: true,
						require: {
							FunctionDeclaration: true,
							MethodDefinition: false,
							ClassDeclaration: true,
							ArrowFunctionExpression: false,
							FunctionExpression: false,
						},
					},
				],
				"jsdoc/require-description": "error",
				"jsdoc/require-param-description": "error",
				"jsdoc/require-returns-description": "error",
				"jsdoc/tag-lines": ["error", "never"],
			},
		},
	];
}

export { jsdocConfig as jsdoc };
