/**
 * Postman-specific errors that callers might want to discriminate.
 */

/**
 * Thrown when Postman returns a `limitReachedError` (e.g., a Free-tier
 * account hitting the "0 APIs" cap). Callers can render "upgrade
 * required" instead of dumping the raw API body.
 */
export class PostmanPlanLimitError extends Error {
  override name = 'PostmanPlanLimitError'

  constructor(
    /** Human-readable plan-limit message from Postman. */
    readonly limitMessage: string,
    /** Original response body (JSON or text). */
    readonly body: string,
  ) {
    super(limitMessage)
  }
}

/**
 * Inspect a Postman error body for the plan-limit shape. Returns the
 * limit message when matched; null otherwise (caller throws a generic
 * `ProviderApiError`).
 */
export function detectPlanLimit(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { name?: string; message?: string } }
    if (parsed.error?.name === 'limitReachedError' && parsed.error.message) {
      return parsed.error.message
    }
  } catch {
    // Not JSON — fall through.
  }
  return null
}
