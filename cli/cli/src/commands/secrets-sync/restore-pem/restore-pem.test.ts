import { describe, expect, it } from "vitest";

import { restorePem } from "./restore-pem.js";

// The markers are built from parts so this file holds no complete private-key block for a secret scanner to find.
const begin = (kind: string) => ["-----", "BEGIN ", kind, "-----"].join("");
const end = (kind: string) => ["-----", "END ", kind, "-----"].join("");

const BODY = "QUJD".repeat(40); // 160 base64 characters, so three lines of 64, 64 and 32
const LINES = [BODY.slice(0, 64), BODY.slice(64, 128), BODY.slice(128)];

const laidOut = (kind: string) => `${begin(kind)}\n${LINES.join("\n")}\n${end(kind)}\n`;
const collapsed = (kind: string) => `${begin(kind)} ${BODY} ${end(kind)}`;

describe("restorePem", () => {
	it("puts a one-line key back on its lines, 64 characters wide", () => {
		expect(restorePem(collapsed("RSA PRIVATE KEY"))).toBe(laidOut("RSA PRIVATE KEY"));
	});

	it("handles every kind of block, not only an RSA key", () => {
		for (const kind of ["PRIVATE KEY", "EC PRIVATE KEY", "CERTIFICATE", "OPENSSH PRIVATE KEY"]) {
			expect(restorePem(collapsed(kind))).toBe(laidOut(kind));
		}
	});

	it("rebuilds a body that was also split by spaces", () => {
		const spaced = `${begin("PRIVATE KEY")} ${LINES.join(" ")} ${end("PRIVATE KEY")}`;
		expect(restorePem(spaced)).toBe(laidOut("PRIVATE KEY"));
	});

	it("ignores whitespace around the whole value", () => {
		expect(restorePem(`\n  ${collapsed("RSA PRIVATE KEY")}  \n`)).toBe(laidOut("RSA PRIVATE KEY"));
	});

	it("leaves a key that is already on its lines exactly as it is", () => {
		const value = laidOut("RSA PRIVATE KEY");
		expect(restorePem(value)).toBe(value);
		const noTrailingNewline = value.trimEnd();
		expect(restorePem(noTrailingNewline)).toBe(noTrailingNewline);
	});

	it("is idempotent", () => {
		const once = restorePem(collapsed("RSA PRIVATE KEY"));
		expect(restorePem(once)).toBe(once);
	});

	it("leaves a value that is not a PEM alone", () => {
		for (const value of ["ghp_abc123", "", "   ", "two words", "-----BEGIN nothing else"]) {
			expect(restorePem(value)).toBe(value);
		}
	});

	it("leaves a block alone when there is nothing between its markers but spaces", () => {
		const value = `${begin("PRIVATE KEY")}   ${end("PRIVATE KEY")}`;
		expect(restorePem(value)).toBe(value);
	});

	it("leaves a block alone when its end marker does not match its begin marker", () => {
		const value = `${begin("PRIVATE KEY")} ${BODY} ${end("CERTIFICATE")}`;
		expect(restorePem(value)).toBe(value);
	});

	it("leaves a legacy encrypted key alone, whose body has header fields it cannot rebuild", () => {
		const value = `${begin("RSA PRIVATE KEY")} Proc-Type: 4,ENCRYPTED DEK-Info: AES-128-CBC,ABCD ${BODY} ${end("RSA PRIVATE KEY")}`;
		expect(restorePem(value)).toBe(value);
	});
});
