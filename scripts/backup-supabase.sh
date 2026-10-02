#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -gt 1 ]]; then
  printf 'Usage: %s [backup-directory]\n' "$0" >&2
  exit 2
fi

for command in age age-keygen node npx tar; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  fi
done

backup_directory="${1:-backups}"
identity_file="${AGE_IDENTITY_FILE:-$HOME/.config/todolist/backup.agekey}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_directory="$(mktemp -d)"
archive_path="${temporary_directory}/todolist-${timestamp}.tar.gz"
encrypted_path="${backup_directory}/todolist-${timestamp}.tar.gz.age"

cleanup() {
  rm -rf "$temporary_directory"
}
trap cleanup EXIT

if [[ ! -f "$identity_file" ]]; then
  printf 'Encryption identity not found: %s\n' "$identity_file" >&2
  printf 'Create it with: age-keygen -o %s\n' "$identity_file" >&2
  exit 1
fi

umask 077
mkdir -p "$backup_directory"
recipient="$(age-keygen -y "$identity_file")"

node scripts/export-supabase-data.mjs "$temporary_directory"
cp supabase-schema.sql "${temporary_directory}/supabase-schema.sql"

tar -czf "$archive_path" -C "$temporary_directory" \
  portable-data.json \
  manifest.json \
  supabase-schema.sql

age --recipient "$recipient" --output "$encrypted_path" "$archive_path"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$encrypted_path" > "${encrypted_path}.sha256"
else
  shasum -a 256 "$encrypted_path" > "${encrypted_path}.sha256"
fi

printf 'Encrypted backup created: %s\n' "$encrypted_path"
printf 'Checksum created: %s\n' "${encrypted_path}.sha256"
