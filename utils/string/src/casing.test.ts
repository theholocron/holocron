import { describe, expect, test } from "vitest";
import * as str from "./index";

describe("String casing", () => {
	test("convert a string to camel case", () => {
		expect(str.toCamelCase("hello world")).toBe("helloWorld");
	});

	test("convert a string to constant case", () => {
		expect(str.toConstantCase("hello world")).toBe("HELLO_WORLD");
	});

	test("convert a string to dot case", () => {
		expect(str.toDotCase("hello world")).toBe("hello.world");
	});

	test("convert a string to kebab case", () => {
		expect(str.toKebabCase("hello world")).toBe("hello-world");
	});

	test("convert a string to lower case", () => {
		expect(str.toLowerCase("HELLO WORLD")).toBe("hello world");
	});

	test("convert a string to pascal case", () => {
		expect(str.toPascalCase("hello world")).toBe("HelloWorld");
	});

	test("convert a string to path case", () => {
		expect(str.toPathCase("hello world")).toBe("hello/world");
	});

	test("convert a string to sentence case", () => {
		expect(str.toSentenceCase("hello world")).toBe("Hello world");
	});

	test("convert a string to snake case", () => {
		expect(str.toSnakeCase("hello world")).toBe("hello_world");
	});

	test("convert a string to title case", () => {
		expect(str.toTitleCase("hello world")).toBe("Hello World");
	});

	test("convert a string to upper case", () => {
		expect(str.toUpperCase("hello world")).toBe("HELLO WORLD");
	});
});
