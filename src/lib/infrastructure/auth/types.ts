/**
 * Auth port for a future non-Supabase provider (e.g. Auth.js / Lucia on DO).
 *
 * Today auth still lives in src/lib/auth.ts + src/lib/supabase/*.
 * Extract behind this interface when migrating Auth off Supabase.
 */

export type AppSession = {
  userId: string;
  email: string;
  lguId: string | null;
  accountType: string;
  isActive: boolean;
};

export interface AuthProvider {
  getSession(): Promise<AppSession | null>;
  signInWithPassword(email: string, password: string): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
}
