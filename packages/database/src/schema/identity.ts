import { ROLES, SESSION_REVOCATION_REASONS } from '@aer/domain';
import { boolean, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAtColumn, tz, updatedAtColumn } from './columns';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
  timezone: text('timezone').notNull().default('America/Recife'),
  archivedAt: tz('archived_at'),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ROLES }).notNull(),
  passwordHash: text('password_hash').notNull(),
  passwordChangedAt: tz('password_changed_at').notNull().defaultNow(),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: tz('last_login_at'),
  archivedAt: tz('archived_at'),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: createdAtColumn(),
  lastSeenAt: tz('last_seen_at').notNull().defaultNow(),
  expiresAt: tz('expires_at').notNull(),
  revokedAt: tz('revoked_at'),
  revokedReason: text('revoked_reason', { enum: SESSION_REVOCATION_REASONS }),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id'),
  actorUserId: uuid('actor_user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  requestId: text('request_id'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAtColumn(),
});
