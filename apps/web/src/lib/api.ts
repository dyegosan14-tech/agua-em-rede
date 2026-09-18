import { CSRF_HEADER, errorResponseSchema } from '@aer/contracts';
import type { ZodType } from 'zod';

export interface ApiFieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: ApiFieldError[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Falha de rede (servidor inacessível / sem conexão), diferente de uma resposta de erro da API. */
  get isNetwork(): boolean {
    return this.code === 'NETWORK';
  }
}

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

type UnauthenticatedListener = () => void;
const unauthenticatedListeners = new Set<UnauthenticatedListener>();
/** Chamado quando uma requisição autenticada recebe 401 (sessão expirada/revogada). */
export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Valida a resposta contra o contrato compartilhado (fonte única com a API). */
  schema?: ZodType<T>;
  signal?: AbortSignal;
}

export async function api<T = void>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers[CSRF_HEADER] = csrfToken;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK', 'Não foi possível conectar ao servidor. Verifique sua conexão.');
  }

  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(await response.json().catch(() => null));
    const apiError = parsed.success
      ? new ApiError(response.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.requestId, parsed.data.error.details)
      : new ApiError(response.status, 'UNKNOWN', `Erro inesperado do servidor (HTTP ${response.status}).`);
    if (response.status === 401 && apiError.code === 'UNAUTHENTICATED') unauthenticatedListeners.forEach((listener) => listener());
    throw apiError;
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json();
  if (!options.schema) return data as T;
  const result = options.schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'A resposta do servidor não segue o contrato esperado.');
  }
  return result.data;
}
