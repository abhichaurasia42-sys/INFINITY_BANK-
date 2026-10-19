// scripts/migrate_to_supabase_http.js
// Node script that uploads the local users.json into Supabase using the REST API.
// Works with Node >= 18 (built‑in fetch) and does not require the @supabase/supabase-js package.

import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = 'https://cmihcvzwachfhrylogpy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtaWhjdnp3YWNoZmhyeWxvZ3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMjEwMjIsImV4cCI6MjEwNzc5NzAyMn0.kr7VwqXTAuptUngWrrEOZQ98QIVJJ-ZofoOpN39ttZg';

const usersPath = join(process.cwd(), 'public', 'users.json');
const raw = readFileSync(usersPath, 'utf8');
const usersObj = JSON.parse(raw); // { "<id>": { ... } }

async function upsertUser(id, user) {
  const payload = { id, ...user };
  // Supabase upsert via POST with "Prefer: resolution=merge-duplicates"
  const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Failed ${id}: ${response.status} ${response.statusText} – ${txt}`);
  }
}

async function migrate() {
  let count = 0;
  for (const [id, user] of Object.entries(usersObj)) {
    try {
      await upsertUser(id, user);
      count++;
    } catch (e) {
      console.error(e.message);
    }
  }
  console.log(`✅ Migration finished – ${count} records upserted`);
}

migrate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
  });
