---
title: security-review
description: Security review checklist. OWASP top 10 and common Node.js/TypeScript security pitfalls.
---

A checklist for reviewing code that handles user input, authentication, secrets, or network requests.

**Invoke as:** `/security-review`

**Trigger:** reviewing code for security issues, auditing a PR, checking for vulnerabilities.

## Checklist

### Injection

- [ ] No SQL built with string concatenation — use parameterized queries
- [ ] No shell commands built from user input — avoid `exec`/`spawn` with interpolated strings
- [ ] No `eval()` or `new Function()` with user-controlled strings

### Authentication and secrets

- [ ] Secrets loaded from environment variables, never hardcoded
- [ ] No secrets in log output (even at debug level)
- [ ] No secrets committed to git (check `.env*`, config files, test fixtures)
- [ ] Tokens not stored in `localStorage` or cookies without `httpOnly`/`Secure`

### Input validation

- [ ] All external input validated at the boundary (HTTP body, CLI args, env vars)
- [ ] File paths from user input sanitized against path traversal (`../`)
- [ ] File uploads restricted by type and size

### Dependencies

- [ ] `pnpm audit` passes (no critical/high vulnerabilities)
- [ ] New dependencies are from reputable, actively maintained sources

### Output / XSS

- [ ] User content rendered in HTML is escaped
- [ ] No `dangerouslySetInnerHTML` with unsanitized input
- [ ] Content-Security-Policy headers set where applicable

### Node.js specific

- [ ] `child_process` calls use the array form of `exec`/`spawn`
- [ ] `fs` operations validate that resolved paths stay within expected directories
- [ ] Rate limiting on endpoints that accept user input

## Escalation

If you find a critical vulnerability (data exposure, auth bypass, RCE), stop implementation and report it immediately rather than fixing it inline.
