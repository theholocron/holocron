import {
	camelCase,
	snakeCase,
	dotCase,
	pathCase,
	sentenceCase,
	constantCase,
	kebabCase,
	pascalCase,
} from "change-case";
import { titleCase } from "title-case";

export const toCamelCase = camelCase;
export const toConstantCase = constantCase;
export const toDotCase = dotCase;
export const toKebabCase = kebabCase;
export const toLowerCase = (str: string): string => str.toLowerCase();
export const toPascalCase = pascalCase;
export const toPathCase = pathCase;
export const toSentenceCase = sentenceCase;
export const toSnakeCase = snakeCase;
export const toTitleCase = titleCase;
export const toUpperCase = (str: string): string => str.toUpperCase();
