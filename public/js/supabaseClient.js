// Supabase client initialization
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://cmihcvzwachfhrylogpy.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtaWhjdnp3YWNoZmhyeWxvZ3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMjEwMjIsImV4cCI6MjEwNzc5NzAyMn0.kr7VwqXTAuptUngWrrEOZQ98QIVJJ-ZofoOpN39ttZg";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
