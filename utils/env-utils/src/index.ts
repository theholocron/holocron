export {
	environment,
	ENVIRONMENTS,
	DEFAULT_ENVIRONMENT,
	DEPLOYED_ENVIRONMENTS,
} from "./environment.js";
export type { Environment } from "./environment.js";

export { createEnvParser } from "./create-env-parser.js";
export { DotenvLoader } from "./loader.js";
export type {
	EnvLoader,
	EnvParser,
	EnvParserOptions,
	EnvObject,
	Primitive,
} from "./types.js";
