// Error messages, stacks, database details, and request bodies can contain secrets.
export function logSecurityError(event, error, logger = console) {
  const record = { event };
  if (["Error", "TypeError", "SyntaxError", "AbortError", "TimeoutError"].includes(error?.name)) {
    record.error_type = error.name;
  }
  if (typeof error?.code === "string" && /^(?:[0-9A-Z]{5}|E[A-Z0-9_]{1,40})$/.test(error.code)) {
    record.error_code = error.code;
  }
  logger.error(JSON.stringify(record));
}
