import type { ErrorCode } from '@aer/contracts';

export interface ErrorDetail {
  path: string;
  message: string;
}

/** Erro de negócio/HTTP com código estável para a interface e mensagem em português. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Sessão ausente ou expirada. Entre novamente.'),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.'),
  forbidden: () => new AppError(403, 'FORBIDDEN', 'Você não tem permissão para realizar esta ação.'),
  csrfInvalid: () => new AppError(403, 'CSRF_INVALID', 'Token CSRF ausente ou inválido.'),
  originNotAllowed: () => new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origem da requisição não permitida.'),
  // Recursos de outra organização também respondem 404: não revelamos que existem.
  notFound: (what = 'Recurso') => new AppError(404, 'NOT_FOUND', `${what} não encontrado.`),
  conflict: (message: string) => new AppError(409, 'CONFLICT', message),
  lastAdmin: () =>
    new AppError(409, 'LAST_ADMIN', 'A organização precisa manter ao menos um administrador ativo.'),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde antes de tentar novamente.', undefined, {
      'retry-after': String(Math.max(1, Math.ceil(retryAfterSeconds))),
    }),
  validation: (message: string, details?: ErrorDetail[]) => new AppError(400, 'VALIDATION_ERROR', message, details),
};
