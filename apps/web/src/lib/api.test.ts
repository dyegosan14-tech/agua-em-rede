import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, onUnauthenticated, setCsrfToken } from './api';

function mockFetch(response: Response | Error) {
  // clone(): cada chamada precisa de um corpo ainda não consumido.
  const fn = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response.clone())));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe('cliente da API', () => {
  it('envia o token CSRF somente em escritas e usa a mesma origem com cookies', async () => {
    setCsrfToken('csrf-123');
    const fetchMock = mockFetch(Response.json({ ok: true }));
    await api('/users');
    await api('/users', { method: 'POST', body: { a: 1 } });

    const [, getInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, postInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect((getInit.headers as Record<string, string>)['x-csrf-token']).toBeUndefined();
    expect(url).toBe('/api/users');
    expect((postInit.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-123');
    expect(postInit.credentials).toBe('same-origin');
    expect(postInit.body).toBe('{"a":1}');
  });

  it('converte o envelope de erro da API em ApiError e notifica sessão expirada', async () => {
    mockFetch(
      Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Sessão ausente ou expirada.', requestId: 'req-1' } }, { status: 401 }),
    );
    const listener = vi.fn();
    const off = onUnauthenticated(listener);
    await expect(api('/auth/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED', requestId: 'req-1' });
    expect(listener).toHaveBeenCalledOnce();
    off();
  });

  it('não trata credencial inválida no login como sessão expirada', async () => {
    mockFetch(Response.json({ error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.', requestId: 'r' } }, { status: 401 }));
    const listener = vi.fn();
    const off = onUnauthenticated(listener);
    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('distingue falha de rede de erro da API', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const error = await api('/users').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetwork).toBe(true);
  });

  it('resposta 204 devolve undefined e corpo fora do contrato é rejeitado', async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();

    const { z } = await import('zod');
    mockFetch(Response.json({ unexpected: true }));
    await expect(api('/x', { schema: z.object({ id: z.string() }) })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
