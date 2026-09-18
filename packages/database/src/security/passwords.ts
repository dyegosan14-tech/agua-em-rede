import { randomBytes } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify, type Algorithm } from '@node-rs/argon2';

// `Algorithm` é um `const enum` ambiente (inutilizável com isolatedModules/verbatimModuleSyntax).
// Valor documentado na própria biblioteca: Argon2d = 0, Argon2i = 1, Argon2id = 2. Um teste garante
// que os hashes gerados usam o prefixo $argon2id$.
const ARGON2ID = 2 as Algorithm;

export interface Argon2Params {
  memoryKib: number;
  timeCost: number;
}

/** Padrão OWASP para Argon2id: 19 MiB, 2 iterações, 1 thread. */
export const DEFAULT_ARGON2_PARAMS: Argon2Params = { memoryKib: 19456, timeCost: 2 };

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  /** Indica se o hash foi gerado com parâmetros diferentes dos atuais (rehash oportunista no login). */
  needsRehash(hash: string): boolean;
  /** Gasta o tempo de uma verificação real (usuário inexistente), reduzindo enumeração por tempo de resposta. */
  verifyDummy(password: string): Promise<void>;
}

// Formato PHC: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
const PHC_PARAMS = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/;

export function createPasswordHasher(params: Argon2Params = DEFAULT_ARGON2_PARAMS): PasswordHasher {
  const options = {
    algorithm: ARGON2ID,
    memoryCost: params.memoryKib,
    timeCost: params.timeCost,
    parallelism: 1,
  } as const;
  let dummyHash: Promise<string> | undefined;

  return {
    hash: (password) => argon2Hash(password, options),
    async verify(hash, password) {
      try {
        return await argon2Verify(hash, password);
      } catch {
        // Hash malformado/corrompido: trata como credencial inválida, nunca como erro 500 com detalhes.
        return false;
      }
    },
    needsRehash(hash) {
      const match = PHC_PARAMS.exec(hash);
      if (!match) return true;
      return Number(match[1]) !== params.memoryKib || Number(match[2]) !== params.timeCost || Number(match[3]) !== 1;
    },
    async verifyDummy(password) {
      dummyHash ??= argon2Hash(randomBytes(16).toString('hex'), options);
      await argon2Verify(await dummyHash, password).catch(() => false);
    },
  };
}
