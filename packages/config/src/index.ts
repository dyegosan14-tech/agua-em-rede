import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

export class ConfigError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(`Configuração de ambiente inválida:\n - ${problems.join('\n - ')}`);
    this.name = 'ConfigError';
  }
}

type Env = Record<string, string | undefined>;

/** Trata variável vazia (ex.: `SEED_PASSWORD=`) como ausente. */
function normalize(source: Env): Env {
  const out: Env = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') out[key] = value.trim();
  }
  return out;
}

const envBool = (fallback: boolean) =>
  z
    .enum(['true', 'false'], { error: 'use "true" ou "false"' })
    .optional()
    .transform((value) => (value === undefined ? fallback : value === 'true'));

const intInRange = (fallback: number, min: number, max: number) =>
  z.coerce
    .number({ error: 'deve ser um número' })
    .int('deve ser inteiro')
    .min(min, `mínimo ${min}`)
    .max(max, `máximo ${max}`)
    .optional()
    .transform((value) => value ?? fallback);

const PLACEHOLDER = /CHANGE_?ME|__GENERATE_/i;

const secret = (minLength: number) =>
  z
    .string({ error: 'obrigatória' })
    .min(minLength, `mínimo de ${minLength} caracteres`)
    .refine((value) => !PLACEHOLDER.test(value), 'contém marcador de exemplo; gere um valor real (npm run setup:env)');

const postgresUrl = z
  .string({ error: 'obrigatória' })
  .regex(/^postgres(ql)?:\/\//, 'deve começar com postgres:// ou postgresql://');

const redisUrl = z
  .string({ error: 'obrigatória' })
  .regex(/^rediss?:\/\//, 'deve começar com redis:// ou rediss://');

const commonShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).optional().transform((v) => v ?? 'development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional()
    .transform((v) => v ?? 'info'),
};

const databaseShape = {
  DATABASE_URL: postgresUrl,
  DATABASE_POOL_MAX: intInRange(10, 1, 100),
};

const redisShape = {
  REDIS_URL: redisUrl,
};

const apiShape = {
  API_HOST: z.string().min(1).optional().transform((v) => v ?? '127.0.0.1'),
  API_PORT: intInRange(3000, 1, 65535),
  CORS_ORIGINS: z
    .string({ error: 'obrigatória' })
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
    .pipe(z.array(z.url('origem inválida').transform((u) => new URL(u).origin)).min(1, 'informe ao menos uma origem')),
  TRUST_PROXY: envBool(false),
  API_DOCS_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  RATE_LIMIT_STORE: z.enum(['redis', 'memory']).optional().transform((v) => v ?? 'redis'),
  SESSION_ABSOLUTE_TTL_HOURS: intInRange(12, 1, 24 * 30),
  SESSION_IDLE_TTL_MINUTES: intInRange(120, 5, 60 * 24 * 7),
  CSRF_SECRET: secret(32),
  ARGON2_MEMORY_KIB: intInRange(19456, 8, 4_194_304),
  ARGON2_TIME_COST: intInRange(2, 1, 20),
  LOGIN_RATE_LIMIT_MAX: intInRange(5, 1, 1000),
  LOGIN_IP_RATE_LIMIT_MAX: intInRange(30, 1, 10_000),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: intInRange(900, 1, 86_400),
};

function issuesToProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const name = issue.path.join('.') || '(raiz)';
    return `${name}: ${issue.message}`;
  });
}

function parse<T extends z.ZodRawShape>(shape: T, source: Env) {
  const result = z.object(shape).safeParse(normalize(source));
  if (!result.success) throw new ConfigError(issuesToProblems(result.error));
  return result.data;
}

export interface DatabaseConfig {
  env: 'development' | 'test' | 'production';
  isProduction: boolean;
  logLevel: string;
  database: { url: string; poolMax: number };
}

export function loadDatabaseConfig(source: Env = process.env): DatabaseConfig {
  const v = parse({ ...commonShape, ...databaseShape }, source);
  return {
    env: v.NODE_ENV,
    isProduction: v.NODE_ENV === 'production',
    logLevel: v.LOG_LEVEL,
    database: { url: v.DATABASE_URL, poolMax: v.DATABASE_POOL_MAX },
  };
}

export interface WorkerConfig extends DatabaseConfig {
  redis: { url: string };
}

export function loadWorkerConfig(source: Env = process.env): WorkerConfig {
  const v = parse({ ...commonShape, ...databaseShape, ...redisShape }, source);
  return {
    env: v.NODE_ENV,
    isProduction: v.NODE_ENV === 'production',
    logLevel: v.LOG_LEVEL,
    database: { url: v.DATABASE_URL, poolMax: v.DATABASE_POOL_MAX },
    redis: { url: v.REDIS_URL },
  };
}

export interface ApiConfig extends WorkerConfig {
  api: { host: string; port: number; corsOrigins: string[]; trustProxy: boolean; docsEnabled: boolean };
  rateLimit: {
    store: 'redis' | 'memory';
    login: { maxPerIdentity: number; maxPerIp: number; windowSeconds: number };
  };
  auth: {
    sessionAbsoluteTtlHours: number;
    sessionIdleTtlMinutes: number;
    csrfSecret: string;
    cookieSecure: boolean;
    argon2: { memoryKib: number; timeCost: number };
  };
}

// Mínimos recomendados pela OWASP para Argon2id; abaixo disso a produção não sobe.
const ARGON2_MIN_MEMORY_KIB = 19456;
const ARGON2_MIN_TIME_COST = 2;

export function loadApiConfig(source: Env = process.env): ApiConfig {
  const v = parse({ ...commonShape, ...databaseShape, ...redisShape, ...apiShape }, source);
  const isProduction = v.NODE_ENV === 'production';

  const problems: string[] = [];
  if (isProduction) {
    if (v.CORS_ORIGINS.some((origin) => !origin.startsWith('https://'))) {
      problems.push('CORS_ORIGINS: em produção todas as origens devem usar https');
    }
    if (v.RATE_LIMIT_STORE !== 'redis') {
      problems.push('RATE_LIMIT_STORE: em produção deve ser "redis" (o limite precisa ser compartilhado entre instâncias)');
    }
    if (v.ARGON2_MEMORY_KIB < ARGON2_MIN_MEMORY_KIB || v.ARGON2_TIME_COST < ARGON2_MIN_TIME_COST) {
      problems.push(
        `ARGON2_*: em produção use memória >= ${ARGON2_MIN_MEMORY_KIB} KiB e custo de tempo >= ${ARGON2_MIN_TIME_COST}`,
      );
    }
  }
  if (problems.length > 0) throw new ConfigError(problems);

  return {
    env: v.NODE_ENV,
    isProduction,
    logLevel: v.LOG_LEVEL,
    database: { url: v.DATABASE_URL, poolMax: v.DATABASE_POOL_MAX },
    redis: { url: v.REDIS_URL },
    api: {
      host: v.API_HOST,
      port: v.API_PORT,
      corsOrigins: v.CORS_ORIGINS,
      trustProxy: v.TRUST_PROXY,
      docsEnabled: v.API_DOCS_ENABLED ?? !isProduction,
    },
    rateLimit: {
      store: v.RATE_LIMIT_STORE,
      login: {
        maxPerIdentity: v.LOGIN_RATE_LIMIT_MAX,
        maxPerIp: v.LOGIN_IP_RATE_LIMIT_MAX,
        windowSeconds: v.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
      },
    },
    auth: {
      sessionAbsoluteTtlHours: v.SESSION_ABSOLUTE_TTL_HOURS,
      sessionIdleTtlMinutes: v.SESSION_IDLE_TTL_MINUTES,
      csrfSecret: v.CSRF_SECRET,
      // Em produção o cookie é sempre Secure (e usa o prefixo __Host-).
      cookieSecure: isProduction,
      argon2: { memoryKib: v.ARGON2_MEMORY_KIB, timeCost: v.ARGON2_TIME_COST },
    },
  };
}

export interface SeedConfig {
  databaseUrl: string;
  seedPassword: string | undefined;
}

/** O seed é exclusivamente demonstrativo: recusa rodar em produção. */
export function loadSeedConfig(source: Env = process.env): SeedConfig {
  const v = parse(
    {
      ...commonShape,
      DATABASE_URL: postgresUrl,
      SEED_PASSWORD: z.string().min(12, 'mínimo de 12 caracteres').max(128).optional(),
    },
    source,
  );
  if (v.NODE_ENV === 'production') {
    throw new ConfigError(['O seed demonstrativo não pode ser executado em produção (NODE_ENV=production)']);
  }
  return { databaseUrl: v.DATABASE_URL, seedPassword: v.SEED_PASSWORD };
}

/**
 * Carrega o .env da raiz do monorepo (procurando a partir do cwd) sem sobrescrever variáveis
 * já definidas. Não faz nada em produção: lá o ambiente vem do orquestrador.
 */
export function loadDotEnvIfPresent(startDir: string = process.cwd()): string | null {
  if (process.env['NODE_ENV'] === 'production') return null;
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
