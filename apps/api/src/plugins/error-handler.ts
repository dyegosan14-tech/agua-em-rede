import type { ErrorCode, ErrorResponse } from '@aer/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { AppError, type ErrorDetail } from '../lib/errors';

function envelope(code: ErrorCode, message: string, requestId: string, details?: ErrorDetail[]): ErrorResponse {
  return { error: { code, message, requestId, ...(details && details.length > 0 ? { details } : {}) } };
}

const CLIENT_ERROR_MESSAGES: Record<number, string> = {
  400: 'Requisição inválida.',
  413: 'O corpo da requisição excede o limite permitido.',
  415: 'Tipo de conteúdo não suportado.',
};

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      if (error.headers) void reply.headers(error.headers);
      return reply.code(error.statusCode).send(envelope(error.code, error.message, request.id, error.details));
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => ({
        path: issue.instancePath.replace(/^\//, '').replace(/\//g, '.') || '(corpo)',
        message: issue.message ?? 'Valor inválido.',
      }));
      return reply.code(400).send(envelope('VALIDATION_ERROR', 'Dados inválidos. Corrija os campos indicados.', request.id, details));
    }

    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500 && !isResponseSerializationError(error)) {
      return reply
        .code(status)
        .send(envelope('VALIDATION_ERROR', CLIENT_ERROR_MESSAGES[status] ?? 'Requisição inválida.', request.id));
    }

    // Erro inesperado: detalhes só no log (com o request id); o cliente recebe uma mensagem genérica.
    request.log.error({ err: error }, 'erro não tratado');
    return reply
      .code(500)
      .send(envelope('INTERNAL_ERROR', `Erro interno. Informe o código da requisição: ${request.id}.`, request.id));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(envelope('NOT_FOUND', 'Recurso não encontrado.', request.id)),
  );
}
