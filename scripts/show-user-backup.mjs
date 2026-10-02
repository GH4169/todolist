import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [archivePath, email] = process.argv.slice(2);
if (!archivePath || !email) {
  throw new Error('Usage: node scripts/show-user-backup.mjs BACKUP_FILE.age EMAIL');
}

const identityFile = process.env.AGE_IDENTITY_FILE || 'backups/backup.agekey';
const maxBuffer = 128 * 1024 * 1024;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { maxBuffer, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr?.toString() || 'see command output'}`);
  }
  return result.stdout;
}

const archive = run('age', ['--decrypt', '--identity', identityFile, archivePath]);
const jsonText = run('tar', ['-xzOf', '-', 'portable-data.json'], { input: archive }).toString();
const backup = JSON.parse(jsonText);
const normalizedEmail = email.trim().toLowerCase();
const user = backup.auth.users.find(row => row.email?.toLowerCase() === normalizedEmail);

if (!user) throw new Error(`No account found for ${email}`);

const ownedTokens = new Set(
  (backup.public.integration_tokens || [])
    .filter(row => row.user_id === user.id)
    .map(row => row.id),
);

const filteredTables = {};
const unassignedRows = {};
for (const [tableName, rows] of Object.entries(backup.public)) {
  const matchingRows = rows.filter(row => {
    if (row.user_id === user.id) return true;
    return tableName === 'mcp_request_logs'
      && row.integration_token_id
      && ownedTokens.has(row.integration_token_id);
  });
  if (matchingRows.length) filteredTables[tableName] = matchingRows;

  const withoutOwner = rows.filter(row => row.user_id == null).length;
  if (withoutOwner) unassignedRows[tableName] = withoutOwner;
}

const identities = backup.auth.identities.filter(row => row.user_id === user.id);
const result = {
  format_version: backup.format_version,
  project_ref: backup.project_ref,
  exported_at: backup.exported_at,
  account: user,
  identities,
  public: filteredTables,
  unassigned_rows_by_table: unassignedRows,
};

const outputDirectory = 'backup-extracted';
const safeEmail = normalizedEmail.replace(/[^a-z0-9._-]/g, '_');
const outputPath = join(outputDirectory, `user-${safeEmail}.json`);
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });

const tableCounts = Object.fromEntries(
  Object.entries(filteredTables).map(([name, rows]) => [name, rows.length]),
);
const totalRows = Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
process.stdout.write(`Account: ${user.email}\nUser ID: ${user.id}\n`);
process.stdout.write(`Owned rows: ${totalRows}\n`);
for (const [tableName, count] of Object.entries(tableCounts)) {
  process.stdout.write(`  ${tableName}: ${count}\n`);
}
if (Object.keys(unassignedRows).length) {
  process.stdout.write(`Rows without a user_id (not attributed): ${JSON.stringify(unassignedRows)}\n`);
}
process.stdout.write(`Filtered data: ${outputPath}\n`);
