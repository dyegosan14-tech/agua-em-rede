import { randomBytes } from 'node:crypto';
import type { Role } from '@aer/domain';
import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { createPasswordHasher, type PasswordHasher } from './security/passwords';
import { devices, networkAssets, organizations, sectors, users, type SupplyScheduleEntry } from './schema';

/**
 * Seed EXCLUSIVAMENTE demonstrativo.
 * Os cadastros geográficos ficam na região de Recife apenas para fins de demonstração: são
 * fictícios e NÃO representam a rede real de distribuição de nenhuma concessionária.
 */
export const DEMO_ORG_SLUG = 'demo-recife';
export const DEMO_EMAIL_DOMAIN = 'demo.aguaemrede.test';

export interface SeedCredential {
  email: string;
  role: Role;
  password: string;
}

export interface SeedResult {
  created: boolean;
  organizationId: string;
  /** Preenchido somente quando os usuários foram criados agora (senhas não são recuperáveis depois). */
  credentials: SeedCredential[];
}

type Ring = [number, number][];
const box = (lonMin: number, latMin: number, lonMax: number, latMax: number): Ring => [
  [lonMin, latMin],
  [lonMax, latMin],
  [lonMax, latMax],
  [lonMin, latMax],
  [lonMin, latMin],
];

interface DemoSector {
  code: string;
  name: string;
  ring: Ring;
  supplySchedule: SupplyScheduleEntry[];
  pipe: [number, number][];
  valve: [number, number];
  pressureSensor: [number, number];
  flowMeter: [number, number];
}

const DEMO_SECTORS: DemoSector[] = [
  {
    code: 'DEMO-01',
    name: 'Setor Fictício Norte (demonstração)',
    ring: box(-34.9, -8.035, -34.885, -8.022),
    supplySchedule: [],
    pipe: [[-34.8975, -8.0285], [-34.8875, -8.0285]],
    valve: [-34.8925, -8.0285],
    pressureSensor: [-34.8935, -8.0255],
    flowMeter: [-34.8965, -8.0285],
  },
  {
    code: 'DEMO-02',
    name: 'Setor Fictício Centro (demonstração)',
    ring: box(-34.885, -8.05, -34.87, -8.035),
    // Único setor demo com horário de abastecimento configurado; os demais permanecem "não configurados".
    supplySchedule: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], start: '05:00', end: '21:00' }],
    pipe: [[-34.8825, -8.0425], [-34.8725, -8.0425]],
    valve: [-34.8775, -8.0425],
    pressureSensor: [-34.8785, -8.0395],
    flowMeter: [-34.8815, -8.0425],
  },
  {
    code: 'DEMO-03',
    name: 'Setor Fictício Sul (demonstração)',
    ring: box(-34.9, -8.065, -34.885, -8.05),
    supplySchedule: [],
    pipe: [[-34.8975, -8.0575], [-34.8875, -8.0575]],
    valve: [-34.8925, -8.0575],
    pressureSensor: [-34.8935, -8.0545],
    flowMeter: [-34.8965, -8.0575],
  },
];

const DEMO_USERS: { local: string; name: string; role: Role }[] = [
  { local: 'admin', name: 'Admin Demonstração', role: 'ADMIN' },
  { local: 'operador', name: 'Operador Demonstração', role: 'OPERATOR' },
  { local: 'tecnico', name: 'Técnico Demonstração', role: 'TECHNICIAN' },
  { local: 'visualizador', name: 'Visualizador Demonstração', role: 'VIEWER' },
];

export async function seedDemo(
  db: Db,
  options: { password?: string | undefined; hasher?: PasswordHasher } = {},
): Promise<SeedResult> {
  const hasher = options.hasher ?? createPasswordHasher();

  const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, DEMO_ORG_SLUG));
  if (existing) return { created: false, organizationId: existing.id, credentials: [] };

  // Hashes calculados antes da transação para não segurar conexão durante o Argon2.
  const credentials: SeedCredential[] = DEMO_USERS.map((user) => ({
    email: `${user.local}@${DEMO_EMAIL_DOMAIN}`,
    role: user.role,
    password: options.password ?? randomBytes(12).toString('base64url'),
  }));
  const hashes = await Promise.all(credentials.map((credential) => hasher.hash(credential.password)));

  const organizationId = await db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({ name: 'Organização Demonstrativa (dados fictícios)', slug: DEMO_ORG_SLUG, isDemo: true })
      .returning({ id: organizations.id });
    if (!organization) throw new Error('Falha ao criar a organização demonstrativa');

    await tx.insert(users).values(
      DEMO_USERS.map((user, index) => ({
        organizationId: organization.id,
        email: `${user.local}@${DEMO_EMAIL_DOMAIN}`,
        name: user.name,
        role: user.role,
        passwordHash: hashes[index] as string,
      })),
    );

    for (const demo of DEMO_SECTORS) {
      const [sector] = await tx
        .insert(sectors)
        .values({
          organizationId: organization.id,
          code: demo.code,
          name: demo.name,
          description: 'Setor fictício criado pelo seed de demonstração. Não representa a rede real.',
          geometry: { type: 'MultiPolygon', coordinates: [[demo.ring]] },
          supplySchedule: demo.supplySchedule,
          isFictional: true,
        })
        .returning({ id: sectors.id });
      if (!sector) throw new Error(`Falha ao criar o setor ${demo.code}`);

      const [meterPoint] = await tx
        .insert(networkAssets)
        .values([
          {
            organizationId: organization.id,
            sectorId: sector.id,
            kind: 'PIPE',
            code: `${demo.code}-TUB-01`,
            name: `Trecho de tubulação fictício ${demo.code}`,
            geometry: { type: 'LineString', coordinates: demo.pipe },
            properties: { diameterMm: 200, material: 'PVC (fictício)' },
            isFictional: true,
          },
          {
            organizationId: organization.id,
            sectorId: sector.id,
            kind: 'VALVE',
            code: `${demo.code}-VAL-01`,
            name: `Válvula fictícia ${demo.code}`,
            geometry: { type: 'Point', coordinates: demo.valve },
            isFictional: true,
          },
        ])
        .returning({ id: networkAssets.id });

      await tx.insert(devices).values([
        {
          organizationId: organization.id,
          sectorId: sector.id,
          assetId: meterPoint?.id ?? null,
          code: `${demo.code}-P01`,
          name: `Sensor de pressão fictício ${demo.code}`,
          kind: 'PRESSURE_SENSOR',
          metrics: ['PRESSURE'],
          location: { type: 'Point', coordinates: demo.pressureSensor },
          rangePressureMin: 0,
          rangePressureMax: 100,
          isFictional: true,
        },
        {
          organizationId: organization.id,
          sectorId: sector.id,
          code: `${demo.code}-Q01`,
          name: `Medidor de vazão fictício ${demo.code}`,
          kind: 'FLOW_METER',
          metrics: ['FLOW'],
          location: { type: 'Point', coordinates: demo.flowMeter },
          rangeFlowMin: 0,
          rangeFlowMax: 500,
          isFictional: true,
        },
      ]);
    }
    return organization.id;
  });

  return { created: true, organizationId, credentials };
}
