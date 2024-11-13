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

export type CaseFn = (str: string) => string;

export const toCamelCase: CaseFn = camelCase;
export const toConstantCase: CaseFn = constantCase;
export const toDotCase: CaseFn = dotCase;
export const toKebabCase: CaseFn = kebabCase;
export const toLowerCase = (str: string): string => str.toLowerCase();
export const toPascalCase: CaseFn = pascalCase;
export const toPathCase: CaseFn = pathCase;
export const toSentenceCase: CaseFn = sentenceCase;
export const toSnakeCase: CaseFn = snakeCase;
export const toTitleCase: CaseFn = titleCase;
export const toUpperCase = (str: string): string => str.toUpperCase();
