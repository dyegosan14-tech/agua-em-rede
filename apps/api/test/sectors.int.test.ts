import { auditLogs, sectors } from '@aer/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestContext, login, seedOrganization, type SeededOrg, type TestContext } from './support/harness';

let ctx: TestContext;
let counter = 0;
const freshOrg = (): Promise<SeededOrg> => seedOrganization(ctx, `sec${(counter += 1)}`);

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('gestão de setores de abastecimento', () => {
  it('cria setor com horário de abastecimento e registra auditoria', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    const response = await call(ctx.app, admin, 'POST', '/api/sectors', {
      code: 'SEC-01',
      name: 'Setor Norte',
      description: 'Setor piloto de demonstração',
      supplySchedule: [{ daysOfWeek: [1, 2, 3, 4, 5], start: '06:00', end: '22:00' }],
    });

    expect(response.statusCode).toBe(201);
    const created = response.json();
    expect(created).toMatchObject({
      code: 'SEC-01',
      name: 'Setor Norte',
      description: 'Setor piloto de demonstração',
      isFictional: false,
    });
    expect(created.supplySchedule).toHaveLength(1);
    expect(created.supplySchedule[0].daysOfWeek).toEqual([1, 2, 3, 4, 5]);

    const [row] = await ctx.testDb.db.select().from(sectors).where(eq(sectors.id, created.id));
    expect(row).toBeDefined();
    expect(row?.code).toBe('SEC-01');

    const audit = await ctx.testDb.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, org.organizationId), eq(auditLogs.action, 'sector.created')));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorUserId).toBe(org.users.ADMIN.id);
  });

  it('impede código duplicado na mesma organização', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    const first = await call(ctx.app, admin, 'POST', '/api/sectors', { code: 'SEC-DUP', name: 'Original' });
    expect(first.statusCode).toBe(201);

    const dup = await call(ctx.app, admin, 'POST', '/api/sectors', { code: 'SEC-DUP', name: 'Duplicado' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('CONFLICT');
  });

  it('garante isolamento multi-inquilino entre organizações', async () => {
    const orgA = await freshOrg();
    const orgB = await freshOrg();
    const adminA = await login(ctx.app, orgA.users.ADMIN.email);
    const adminB = await login(ctx.app, orgB.users.ADMIN.email);

    const resA = await call(ctx.app, adminA, 'POST', '/api/sectors', { code: 'SEC-A', name: 'Setor Org A' });
    const sectorA = resA.json();

    // Org B tenta detalhar o setor da Org A -> 404 (indistinguível de inexistente)
    const readAttempt = await call(ctx.app, adminB, 'GET', `/api/sectors/${sectorA.id}`);
    expect(readAttempt.statusCode).toBe(404);

    // Org B lista setores e não enxerga o setor da Org A
    const listB = await call(ctx.app, adminB, 'GET', '/api/sectors');
    expect(listB.statusCode).toBe(200);
    expect(listB.json().items.some((s: { id: string }) => s.id === sectorA.id)).toBe(false);

    // Org B tenta atualizar setor da Org A -> 404
    const updateAttempt = await call(ctx.app, adminB, 'PATCH', `/api/sectors/${sectorA.id}`, { name: 'Invasão' });
    expect(updateAttempt.statusCode).toBe(404);
  });

  it('aplica permissões: VIEWER pode ler mas não pode criar nem alterar', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);
    const viewer = await login(ctx.app, org.users.VIEWER.email);

    const res = await call(ctx.app, admin, 'POST', '/api/sectors', { code: 'SEC-PERM', name: 'Permissões' });
    const sector = res.json();

    const read = await call(ctx.app, viewer, 'GET', `/api/sectors/${sector.id}`);
    expect(read.statusCode).toBe(200);

    const createForbidden = await call(ctx.app, viewer, 'POST', '/api/sectors', { code: 'SEC-NO', name: 'Não permitido' });
    expect(createForbidden.statusCode).toBe(403);

    const updateForbidden = await call(ctx.app, viewer, 'PATCH', `/api/sectors/${sector.id}`, { name: 'Não permitido' });
    expect(updateForbidden.statusCode).toBe(403);
  });
});
