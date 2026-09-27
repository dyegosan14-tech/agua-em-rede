import { networkAssets, sectors } from '@aer/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestContext, login, seedOrganization, type SeededOrg, type TestContext } from './support/harness';

let ctx: TestContext;
let counter = 0;
const freshOrg = (): Promise<SeededOrg> => seedOrganization(ctx, `nas${(counter += 1)}`);

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('consulta de ativos da rede de distribuição', () => {
  it('lista tubulações e válvulas com isolamento multitenant e filtro por setor', async () => {
    const org1 = await freshOrg();
    const org2 = await freshOrg();
    const admin1 = await login(ctx.app, org1.users.ADMIN.email);
    const admin2 = await login(ctx.app, org2.users.ADMIN.email);

    // Cria setor na org 1
    const [sec1] = await ctx.testDb.db
      .insert(sectors)
      .values({
        organizationId: org1.organizationId,
        code: 'SEC-A',
        name: 'Setor A',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [[[[-34.9, -8.05], [-34.88, -8.05], [-34.88, -8.03], [-34.9, -8.03], [-34.9, -8.05]]]],
        },
      })
      .returning();

    // Insere ativos na org 1
    const [pipe] = await ctx.testDb.db
      .insert(networkAssets)
      .values({
        organizationId: org1.organizationId,
        sectorId: sec1!.id,
        kind: 'PIPE',
        code: 'TUB-01',
        name: 'Adutora Principal Norte',
        geometry: { type: 'LineString', coordinates: [[-34.89, -8.04], [-34.88, -8.04]] },
        properties: { diameterMm: 300, material: 'FoFo' },
      })
      .returning();

    await ctx.testDb.db.insert(networkAssets).values({
      organizationId: org1.organizationId,
      sectorId: sec1!.id,
      kind: 'VALVE',
      code: 'VAL-01',
      name: 'Válvula de Bloqueio 01',
      geometry: { type: 'Point', coordinates: [-34.89, -8.04] },
    });

    // Insere ativo na org 2
    await ctx.testDb.db.insert(networkAssets).values({
      organizationId: org2.organizationId,
      kind: 'PIPE',
      code: 'TUB-ORG2',
      name: 'Tubulação Outra Empresa',
      geometry: { type: 'LineString', coordinates: [[-34.91, -8.06], [-34.9, -8.06]] },
    });

    // 1. Lista todos os ativos da org 1
    const resAll = await call(ctx.app, admin1, 'GET', '/api/network-assets?limit=50&offset=0');
    expect(resAll.statusCode).toBe(200);
    const dataAll = resAll.json();
    expect(dataAll.items).toHaveLength(2);
    expect(dataAll.page.total).toBe(2);

    // 2. Filtra por tipo PIPE
    const resPipes = await call(ctx.app, admin1, 'GET', '/api/network-assets?kind=PIPE&limit=50&offset=0');
    expect(resPipes.statusCode).toBe(200);
    const dataPipes = resPipes.json();
    expect(dataPipes.items).toHaveLength(1);
    expect(dataPipes.items[0].code).toBe('TUB-01');
    expect(dataPipes.items[0].properties.diameterMm).toBe(300);

    // 3. Detalha ativo específico
    const resSingle = await call(ctx.app, admin1, 'GET', `/api/network-assets/${pipe!.id}`);
    expect(resSingle.statusCode).toBe(200);
    expect(resSingle.json().name).toBe('Adutora Principal Norte');

    // 4. Isolamento: Org 2 não vê ativos da Org 1
    const resOrg2 = await call(ctx.app, admin2, 'GET', '/api/network-assets?limit=50&offset=0');
    expect(resOrg2.statusCode).toBe(200);
    const dataOrg2 = resOrg2.json();
    expect(dataOrg2.items).toHaveLength(1);
    expect(dataOrg2.items[0].code).toBe('TUB-ORG2');

    // 5. Org 2 não pode acessar por ID direto o ativo da Org 1
    const resForbidden = await call(ctx.app, admin2, 'GET', `/api/network-assets/${pipe!.id}`);
    expect(resForbidden.statusCode).toBe(404);
  });
});
