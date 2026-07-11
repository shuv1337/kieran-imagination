import type { FailureCategory } from '../../shared/creation';

export class CreationError extends Error {
  constructor(
    public category: FailureCategory,
    /** Internal/detail message — never send raw provider text to clients. */
    message: string,
    public retryable = false,
    public httpStatus = 500,
    /** True if Google was already contacted (or response ambiguous). */
    public providerTouched = false
  ) {
    super(message);
    this.name = 'CreationError';
  }
}

/** Fixed kid-safe public strings per failure category. */
export const PUBLIC_ERROR_MESSAGES: Record<FailureCategory, string> = {
  invalid_input: 'That request looks incomplete. Check your prompt or image and try again.',
  filtered: 'Your idea was blocked by content filters. Try a different, kid-friendly idea!',
  rate_limited: 'The magic studio is busy. Please wait a moment and try again.',
  provider_unavailable: "We couldn't reach the art studio. Please try again.",
  timeout: 'That took too long. Please try again.',
  no_output: "We didn't get a picture back. Please try again.",
  normalization_failed: "We couldn't finish preparing the image. Please try again.",
  budget_exceeded: 'Daily creation limit reached. Try again after midnight UTC.',
  cancelled: 'This job was cancelled.',
  internal: 'Something went wrong. Please try again.',
};

export function invalidInput(message: string): CreationError {
  return new CreationError('invalid_input', message, false, 400, false);
}

export function filtered(
  message = 'Content was filtered. Try a different kid-friendly idea.'
): CreationError {
  return new CreationError('filtered', message, false, 400, true);
}

export function rateLimited(message = 'Provider rate limited. Please wait and try again.'): CreationError {
  return new CreationError('rate_limited', message, true, 429, true);
}

export function providerUnavailable(
  message = 'Provider unavailable.',
  providerTouched = true
): CreationError {
  return new CreationError('provider_unavailable', message, true, 502, providerTouched);
}

export function timeout(message = 'Provider timed out.', ambiguous = true): CreationError {
  // Post-send timeouts are ambiguous — not auto-retryable at the attempt level
  return new CreationError('timeout', message, !ambiguous, 504, true);
}

export function noOutput(message = 'No image or text was generated.'): CreationError {
  return new CreationError('no_output', message, false, 502, true);
}

export function normalizationFailed(message = 'Image normalization failed.'): CreationError {
  return new CreationError('normalization_failed', message, false, 502, true);
}

export function budgetExceeded(message = 'Daily creation credit limit reached.'): CreationError {
  return new CreationError('budget_exceeded', message, false, 429, false);
}

export function cancelled(message = 'Job was cancelled.'): CreationError {
  return new CreationError('cancelled', message, false, 409, false);
}

export function internal(message = 'Internal error.'): CreationError {
  return new CreationError('internal', message, false, 500, false);
}

/** Whether the Workflow may spend the second reserved attempt. */
export function isDefiniteTransient(error: unknown): boolean {
  if (!(error instanceof CreationError)) return false;
  return (
    error.retryable &&
    (error.category === 'rate_limited' ||
      error.category === 'provider_unavailable' ||
      error.category === 'timeout')
  );
}

/** Charge credits only when the provider was touched or the outcome is ambiguous. */
export function shouldChargeAttempt(error: unknown): boolean {
  if (error instanceof CreationError) {
    return error.providerTouched;
  }
  // Unknown errors after calling adapter are charged conservatively
  return true;
}

export function shouldRetryAttempt(error: unknown): boolean {
  if (!(error instanceof CreationError)) return false;
  if (error.category === 'timeout' && !error.retryable) return false; // ambiguous
  return isDefiniteTransient(error);
}

export function sanitizeErrorMessage(error: unknown): {
  category: FailureCategory;
  message: string;
  internalMessage: string;
} {
  if (error instanceof CreationError) {
    return {
      category: error.category,
      message: PUBLIC_ERROR_MESSAGES[error.category],
      internalMessage: error.message,
    };
  }
  const internalMessage = error instanceof Error ? error.message : String(error);
  return {
    category: 'internal',
    message: PUBLIC_ERROR_MESSAGES.internal,
    internalMessage,
  };
}
