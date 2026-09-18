interface PgLikeError {
  code?: string;
  constraint?: string;
  cause?: unknown;
}

/** O Drizzle embrulha erros do driver em `cause`; percorre a cadeia até achar o erro do PostgreSQL. */
export function findPgError(error: unknown): PgLikeError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const candidate = current as PgLikeError;
    if (typeof candidate.code === 'string') return candidate;
    current = candidate.cause;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = findPgError(error);
  return pgError?.code === '23505' && (constraint === undefined || pgError.constraint === constraint);
}
