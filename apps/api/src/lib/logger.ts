import type { ApiConfig } from '@aer/config';
import { pino, stdSerializers, stdTimeFunctions, type Logger, type LoggerOptions } from 'pino';

/** Caminhos que nunca devem aparecer em log, mesmo que alguém logue um objeto inteiro por engano. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.secret',
  '*.token',
  '*.csrfToken',
  '*.authorization',
  '*.cookie',
];

export function loggerOptions(config: Pick<ApiConfig, 'logLevel' | 'isProduction'>, name = 'aer-api'): LoggerOptions {
  return {
    level: config.logLevel,
    base: { service: name },
    timestamp: stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    serializers: {
      // Serializadores explícitos: nunca despejar cabeçalhos (cookies) nem corpo da requisição.
      req: (request: { method?: string; url?: string; id?: string; ip?: string }) => ({
        method: request.method,
        url: request.url,
        requestId: request.id,
        remoteAddress: request.ip,
      }),
      res: (reply: { statusCode?: number }) => ({ statusCode: reply.statusCode }),
      err: stdSerializers.err,
    },
  };
}

export function createLogger(config: Pick<ApiConfig, 'logLevel' | 'isProduction'>, name = 'aer-api'): Logger {
  return pino({
    ...loggerOptions(config, name),
    ...(config.isProduction
      ? {}
      : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }),
  });
}
