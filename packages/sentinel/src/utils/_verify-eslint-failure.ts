// Throwaway file to verify eslint findings are now merge-blocking
// (conclusion: "failure") against the real deployed Sentinel instance.
// Delete before closing the test PR.
export function verifyEslintFailure(): number {
	const unusedVariable = "this triggers @typescript-eslint/no-unused-vars, an error-severity eslint rule";
	return 42;
}
