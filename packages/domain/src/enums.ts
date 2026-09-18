/**
 * Enumerações do domínio. Devem coincidir com os CHECKs das migrations SQL
 * (o teste de integração de schema compara os valores).
 */

export const METRICS = ['PRESSURE', 'FLOW'] as const;
export type Metric = (typeof METRICS)[number];

/** Unidades padronizadas do MVP: pressão em metros de coluna d'água, vazão em metros cúbicos por hora. */
export const METRIC_UNITS: Record<Metric, string> = { PRESSURE: 'mca', FLOW: 'm3/h' };

export const DEVICE_KINDS = ['PRESSURE_SENSOR', 'FLOW_METER', 'MULTI_SENSOR'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export const ASSET_KINDS = ['PIPE', 'VALVE', 'HYDRANT', 'RESERVOIR', 'PUMP_STATION', 'METER_POINT', 'OTHER'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const MEASUREMENT_QUALITIES = ['GOOD', 'SUSPECT', 'BAD'] as const;
export type MeasurementQuality = (typeof MEASUREMENT_QUALITIES)[number];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RULE_KINDS = [
  'LOW_PRESSURE',
  'HIGH_FLOW',
  'FLOW_UP_PRESSURE_DOWN',
  'NO_COMMUNICATION',
  'OUT_OF_PHYSICAL_RANGE',
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export const RULE_SCOPES = ['ORGANIZATION', 'SECTOR', 'DEVICE'] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const ALERT_EVENT_TYPES = [
  'DETECTED',
  'RETRIGGERED',
  'STATUS_CHANGED',
  'RECOVERY_OBSERVED',
  'NOTE',
  'WORK_ORDER_LINKED',
] as const;
export type AlertEventType = (typeof ALERT_EVENT_TYPES)[number];

export const WORK_ORDER_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_RESOURCES', 'COMPLETED', 'CANCELLED'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

export const WORK_ORDER_DIAGNOSES = [
  'LEAK_CONFIRMED',
  'LEAK_NOT_FOUND',
  'SENSOR_OR_COMMS_FAULT',
  'OPERATIONAL_CAUSE',
  'INCONCLUSIVE',
  'OTHER',
] as const;
export type WorkOrderDiagnosis = (typeof WORK_ORDER_DIAGNOSES)[number];

export const WORK_ORDER_EVENT_TYPES = [
  'CREATED',
  'ASSIGNED',
  'STATUS_CHANGED',
  'INSPECTION_RECORDED',
  'REPAIR_RECORDED',
  'ATTACHMENT_ADDED',
  'NOTE',
  'SYNC_CONFLICT',
] as const;
export type WorkOrderEventType = (typeof WORK_ORDER_EVENT_TYPES)[number];

export const ATTACHMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number];

export const SIMULATION_SCENARIOS = [
  'NORMAL_OPERATION',
  'GRADUAL_FLOW_INCREASE',
  'PRESSURE_DROP',
  'COMBINED_EVENT',
  'SENSOR_OFFLINE',
  'INVALID_VALUES',
  'SCHEDULED_MAINTENANCE',
  'POST_INTERVENTION_NORMALIZATION',
] as const;
export type SimulationScenario = (typeof SIMULATION_SCENARIOS)[number];

export const SIMULATION_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type SimulationStatus = (typeof SIMULATION_STATUSES)[number];

export const SESSION_REVOCATION_REASONS = [
  'LOGOUT',
  'ADMIN_REVOKED',
  'PASSWORD_CHANGED',
  'USER_DEACTIVATED',
  'ROLE_CHANGED',
] as const;
export type SessionRevocationReason = (typeof SESSION_REVOCATION_REASONS)[number];
