import { z } from 'zod';

/** Mensagens de validação do Zod em português do Brasil (API e interface). Idempotente. */
export function configureZodLocale(): void {
  z.config(z.locales.pt());
}
