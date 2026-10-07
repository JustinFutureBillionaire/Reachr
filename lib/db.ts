import { createClient } from "@supabase/supabase-js";

export const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
