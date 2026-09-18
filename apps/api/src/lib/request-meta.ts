import type { FastifyRequest } from 'fastify';

/** Contexto de rastreabilidade de uma requisição (auditoria e logs). */
export interface RequestMeta {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

export function requestMeta(request: FastifyRequest): RequestMeta {
  const userAgent = request.headers['user-agent'];
  return {
    requestId: request.id,
    ip: request.ip || null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : null,
  };
}
