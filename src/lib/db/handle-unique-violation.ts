export function isHandleUniqueViolation(error: unknown): boolean {
  const seen = new Set<object>();
  let current: unknown = error;

  // Drizzle wraps the driver's PostgresError as DrizzleQueryError.cause.
  // Bound traversal and track visited objects in case an unusual error forms a cycle.
  for (let depth = 0; depth < 8 && current && typeof current === 'object' && !seen.has(current); depth += 1) {
    seen.add(current);
    const postgresError = current as { code?: string; constraint?: string; constraint_name?: string; cause?: unknown };
    if (
      postgresError.code === '23505'
      && (postgresError.constraint_name ?? postgresError.constraint) === 'users_handle_unique'
    ) {
      return true;
    }
    current = postgresError.cause;
  }

  return false;
}
