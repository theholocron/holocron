import react from "eslint-plugin-react";

export function reactConfig() {
	return [
		react.configs.flat.recommended,
		react.configs.flat["jsx-runtime"],
	];
}

export { reactConfig as react };
