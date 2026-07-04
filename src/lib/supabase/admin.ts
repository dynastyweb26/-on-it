// Layer 6: service-role isolation. This file must ONLY ever be imported
// from route handlers / server code. The key never reaches the client bundle.
import 'server-only' /* if this import errors, run: npm i server-only */;
import { createClient } from '@supabase/supabase-js';

export const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
