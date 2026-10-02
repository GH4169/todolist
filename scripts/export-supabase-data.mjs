import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('Output directory is required');

const maxBuffer = 64 * 1024 * 1024;

function query(sql) {
  const result = spawnSync('npx', [
    '--yes',
    'supabase',
    'db',
    'query',
    '--linked',
    sql,
    '--output-format',
    'json',
  ], { encoding: 'utf8', maxBuffer });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Supabase query failed: ${result.stderr || 'see CLI output'}`);
  }

  const jsonStart = result.stdout.indexOf('{');
  if (jsonStart < 0) throw new Error('Supabase CLI returned no JSON result');
  const response = JSON.parse(result.stdout.slice(jsonStart));
  if (response.error) throw new Error(`Supabase query failed: ${response.error.message}`);
  return response.rows || [];
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

const tableRows = query(`
  select table_name
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by table_name
`).map(row => row.table_name);

const publicData = {};
for (const tableName of tableRows) {
  const table = quoteIdentifier(tableName);
  publicData[tableName] = query(`select * from public.${table} order by id`);
}

const authUsers = query('select * from auth.users order by id');
const authIdentities = query('select * from auth.identities order by id');

const backup = {
  format_version: 1,
  project_ref: 'zfxvwlddhxhjumwedsjt',
  exported_at: new Date().toISOString(),
  public: publicData,
  auth: {
    users: authUsers,
    identities: authIdentities,
  },
};

const manifest = {
  format_version: backup.format_version,
  project_ref: backup.project_ref,
  exported_at: backup.exported_at,
  public_tables: Object.fromEntries(
    Object.entries(publicData).map(([name, rows]) => [name, rows.length]),
  ),
  auth_users: authUsers.length,
  auth_identities: authIdentities.length,
  includes_password_hashes: true,
  includes_live_sessions: false,
};

mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
writeFileSync(join(outputDirectory, 'portable-data.json'), `${JSON.stringify(backup)}\n`, {
  mode: 0o600,
});
writeFileSync(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
  mode: 0o600,
});

const totalPublicRows = Object.values(publicData).reduce((sum, rows) => sum + rows.length, 0);
process.stdout.write(
  `Exported ${tableRows.length} public tables (${totalPublicRows} rows), `
  + `${authUsers.length} auth users, and ${authIdentities.length} identities.\n`,
);
