import {
	camelCase,
	constantCase,
	dotCase,
	kebabCase,
	pascalCase,
	pathCase,
	sentenceCase,
	snakeCase,
} from "change-case";
import { titleCase } from "title-case";

/** A function that converts a string to another casing. */
export type CaseFn = (str: string) => string;

/** Converts to camelCase. */
export const toCamelCase: CaseFn = camelCase;
/** Converts to CONSTANT_CASE. */
export const toConstantCase: CaseFn = constantCase;
/** Converts to dot.case. */
export const toDotCase: CaseFn = dotCase;
/** Converts to kebab-case. */
export const toKebabCase: CaseFn = kebabCase;
/** Converts to lower case. */
export const toLowerCase = (str: string): string => str.toLowerCase();
/** Converts to PascalCase. */
export const toPascalCase: CaseFn = pascalCase;
/** Converts to path/case. */
export const toPathCase: CaseFn = pathCase;
/** Converts to Sentence case. */
export const toSentenceCase: CaseFn = sentenceCase;
/** Converts to snake_case. */
export const toSnakeCase: CaseFn = snakeCase;
/** Converts to Title Case. */
export const toTitleCase: CaseFn = titleCase;
/** Converts to UPPER CASE. */
export const toUpperCase = (str: string): string => str.toUpperCase();
