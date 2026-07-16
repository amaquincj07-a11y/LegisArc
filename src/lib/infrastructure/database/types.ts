/**
 * Database access port (future).
 *
 * Today: Server Actions call Supabase PostgREST via src/lib/*-actions.ts.
 * Migration path: introduce repositories (OrdinanceRepository, etc.) that
 * implement these shapes with:
 *   1) Supabase JS (current), then
 *   2) pg / Drizzle / Prisma against self-hosted Postgres on DO.
 *
 * Keep SQL migrations under supabase/migrations portable (plain Postgres).
 */

export type PageResult<T> = {
  items: T[];
  total: number;
};

export interface OrdinanceRepository {
  // Placeholder — flesh out when extracting repos from ordinance-actions.ts
  listByLgu(lguId: string): Promise<unknown[]>;
  findById(lguId: string, id: string): Promise<unknown | null>;
}
