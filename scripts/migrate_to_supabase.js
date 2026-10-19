// scripts/migrate_to_supabase.js
import supabase from '../public/js/supabaseClient.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load local users JSON (keyed by user id)
const usersPath = join(process.cwd(), 'public', 'users.json');
const raw = readFileSync(usersPath, 'utf8');
const usersObj = JSON.parse(raw); // { "<id>": { ... } }

async function migrate() {
  let inserted = 0;
  for (const [id, user] of Object.entries(usersObj)) {
    const payload = { id, ...user };
    const { error } = await supabase.from('users').upsert(payload, { returning: 'minimal' });
    if (error) {
      console.error(`❌ Failed upsert for ${id}:`, error.message);
    } else {
      inserted++;
    }
  }
  console.log(`✅ Migration finished – ${inserted} records upserted`);
}

migrate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
  });
