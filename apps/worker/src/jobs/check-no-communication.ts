import { alertEvents, alerts, detectionRules, devices } from '@aer/database';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { JobDeps } from './purge-sessions';

export const CHECK_NO_COMMUNICATION_JOB = 'check-no-communication';

export async function checkNoCommunicationJob(
  deps: JobDeps,
  _rawPayload: unknown,
): Promise<{ checkedDevices: number; alertsCreated: number }> {
  const { db, clock, logger } = deps;
  const now = clock();

  const activeDevices = await db
    .select()
    .from(devices)
    .where(and(eq(devices.status, 'ACTIVE'), isNull(devices.archivedAt)));

  let alertsCreated = 0;

  for (const dev of activeDevices) {
    const toleranceSeconds = dev.expectedIntervalSeconds * 2;
    const thresholdDate = new Date(now.getTime() - toleranceSeconds * 1000);

    const isOffline = dev.lastReceivedAt ? dev.lastReceivedAt < thresholdDate : dev.createdAt < thresholdDate;

    if (!isOffline) continue;

    const dedupKey = `${dev.organizationId}:NO_COMMUNICATION:${dev.id}`;

    // Verifica se já existe alerta ativo para este sensor
    const [existing] = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.organizationId, dev.organizationId),
          eq(alerts.dedupKey, dedupKey),
          sql`${alerts.status} IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING')`,
        ),
      )
      .limit(1);

    if (existing) continue;

    const delayMinutes = dev.lastReceivedAt
      ? Math.round((now.getTime() - dev.lastReceivedAt.getTime()) / 60000)
      : Math.round((now.getTime() - dev.createdAt.getTime()) / 60000);

    let ruleId: string;
    const [existingRule] = await db
      .select({ id: detectionRules.id })
      .from(detectionRules)
      .where(and(eq(detectionRules.organizationId, dev.organizationId), eq(detectionRules.kind, 'NO_COMMUNICATION')))
      .limit(1);

    if (existingRule) {
      ruleId = existingRule.id;
    } else {
      const [newRule] = await db
        .insert(detectionRules)
        .values({
          organizationId: dev.organizationId,
          name: 'Vigilância de Ausência de Comunicação IoT',
          kind: 'NO_COMMUNICATION',
          scopeType: 'ORGANIZATION',
          params: {},
          windowSeconds: 3600,
          minDurationSeconds: 600,
          minCoverageRatio: '0.500',
          severity: 'HIGH',
          isEnabled: true,
        })
        .returning({ id: detectionRules.id });
      ruleId = newRule!.id;
    }

    const [alert] = await db
      .insert(alerts)
      .values({
        organizationId: dev.organizationId,
        ruleId,
        sectorId: dev.sectorId,
        deviceId: dev.id,
        dedupKey,
        severity: 'HIGH',
        status: 'OPEN',
        title: `Perda de Comunicação: ${dev.code} (${dev.name})`,
        priorityScore: 70,
        evidence: {
          pattern: 'NO_COMMUNICATION',
          deviceCode: dev.code,
          expectedIntervalSeconds: dev.expectedIntervalSeconds,
          lastReceivedAt: dev.lastReceivedAt?.toISOString() ?? null,
          delayMinutes,
          note: `Sensor sem transmitir há mais de ${delayMinutes} minutos. Limite esperado: ${dev.expectedIntervalSeconds}s.`,
        },
        occurrences: 1,
        firstDetectedAt: now,
        lastDetectedAt: now,
        origin: dev.isFictional ? 'SIMULATED' : 'REAL',
      })
      .returning({ id: alerts.id });

    if (alert) {
      await db.insert(alertEvents).values({
        organizationId: dev.organizationId,
        alertId: alert.id,
        eventType: 'DETECTED',
        toStatus: 'OPEN',
        note: `Disparo automático pelo worker de vigilância IoT (${delayMinutes} min sem sinal).`,
      });
      alertsCreated += 1;
    }
  }

  logger.info({ checked: activeDevices.length, alertsCreated }, 'varredura de ausência de comunicação concluída');
  return { checkedDevices: activeDevices.length, alertsCreated };
}
