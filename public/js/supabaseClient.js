// Supabase client initialization
// Credentials are fetched from the server (/config) so they stay out of source code.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

async function initSupabase() {
    const res = await fetch("/config");
    const { supabaseUrl, supabaseAnonKey } = await res.json();
    return createClient(supabaseUrl, supabaseAnonKey);
}

const supabase = await initSupabase();

export default supabase;
