/**
 * Replaces the literal `otp` value in a "would run: pnpm ..." dry-run
 * preview line with `***` — the real `args` passed to `exec()` still need
 * the raw OTP (npm's own `--otp` flag has no env-var alternative), but the
 * preview is printed straight to the terminal / captured as dry-run output
 * and must never echo a live 2FA code back out.
 */
export function redactOtp(args: readonly string[], otp: string | undefined): string[] {
	if (!otp) return [...args];
	return args.map((arg) => (arg === otp ? "***" : arg));
}
