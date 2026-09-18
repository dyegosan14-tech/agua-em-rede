import { sql, type SQLWrapper } from 'drizzle-orm';
import { customType, timestamp } from 'drizzle-orm/pg-core';
import { Geometry as WkxGeometry } from 'wkx';

/** timestamptz sempre em UTC; a conversão para America/Recife acontece apenas na interface. */
export const tz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
export const createdAtColumn = () => tz('created_at').notNull().defaultNow();
export const updatedAtColumn = () => tz('updated_at').notNull().defaultNow();

export interface GeoJsonGeometry {
  type: string;
  coordinates?: unknown;
  geometries?: unknown;
}

/**
 * Coluna PostGIS com SRID 4326.
 *  - Escrita: recebe GeoJSON e converte com ST_GeomFromGeoJSON + ST_SetSRID (parametrizado).
 *  - Leitura: o driver devolve EWKB em hexadecimal; convertemos para GeoJSON com `wkx`.
 * Tipos MultiPolygon/Point etc. são impostos pela coluna no banco (geometry(Tipo, 4326)).
 */
export const geometryColumn = (name: string, sqlType: string) =>
  customType<{ data: GeoJsonGeometry; driverData: string }>({
    dataType() {
      return sqlType;
    },
    toDriver(value) {
      // O tipo declarado é `string`, mas o Drizzle aceita SQL como valor de parâmetro.
      return sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(value)}), 4326)` as unknown as string;
    },
    fromDriver(value) {
      return WkxGeometry.parse(Buffer.from(value, 'hex')).toGeoJSON() as GeoJsonGeometry;
    },
  })(name);

/** Expressão SQL que devolve a geometria como GeoJSON (útil em SELECT com agregações/ST_*). */
export const asGeoJson = (column: SQLWrapper) => sql<GeoJsonGeometry | null>`ST_AsGeoJSON(${column})::json`;
