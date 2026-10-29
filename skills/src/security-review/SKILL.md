---
name: security-review
title: Security Review
description: Security review checklist. INVOKE WHEN: reviewing code for security issues, auditing a PR, checking for vulnerabilities. Check for OWASP top 10 and common Node.js/TypeScript security pitfalls.
---

# security review

## checklist

Run through these for any code that handles user input, authentication, secrets,
or network requests.

### injection

- [ ] No SQL built with string concatenation — use parameterized queries
- [ ] No shell commands built from user input — avoid `exec`/`spawn` with interpolated strings
- [ ] No `eval()` or `new Function()` with user-controlled strings
- [ ] Template literals used in shell commands are sanitized

### authentication and secrets

- [ ] Secrets loaded from environment variables, never hardcoded
- [ ] No secrets in log output (even at debug level)
- [ ] No secrets committed to git (check `.env*`, config files, test fixtures)
- [ ] Tokens/credentials not stored in `localStorage` or cookies without `httpOnly`/`Secure`

### input validation

- [ ] All external input validated at the boundary (HTTP body, CLI args, env vars)
- [ ] File paths from user input sanitized against path traversal (`../`)
- [ ] File uploads restricted by type and size

### dependencies

- [ ] `pnpm audit` passes (no critical/high vulnerabilities)
- [ ] New dependencies are from reputable sources with active maintenance
- [ ] Avoid dependencies that do too much (bloated attack surface)

### output / XSS

- [ ] User content rendered in HTML is escaped (no `dangerouslySetInnerHTML` with unsanitized input)
- [ ] Content-Security-Policy headers set where applicable

### Node.js specific

- [ ] `child_process` calls use the array form of `exec`/`spawn` to avoid shell injection
- [ ] `fs` operations validate that resolved paths stay within expected directories
- [ ] Rate limiting on any endpoint that accepts user input

## when to stop and escalate

If you find a critical vulnerability (data exposure, auth bypass, RCE), stop
implementation and report it immediately rather than trying to fix it inline.
