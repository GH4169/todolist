#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  printf 'Usage: %s BACKUP_FILE.gpg [output-directory]\n' "$0" >&2
  exit 2
fi

for command in age tar; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  fi
done

backup_file="$1"
output_directory="${2:-backup-extracted}"
identity_file="${AGE_IDENTITY_FILE:-$HOME/.config/todolist/backup.agekey}"

if [[ ! -f "$backup_file" ]]; then
  printf 'Backup file does not exist: %s\n' "$backup_file" >&2
  exit 1
fi
if [[ ! -f "$identity_file" ]]; then
  printf 'Encryption identity not found: %s\n' "$identity_file" >&2
  exit 1
fi

mkdir -p "$output_directory"
age --decrypt --identity "$identity_file" "$backup_file" | tar -xzf - -C "$output_directory"
printf 'Backup extracted to: %s\n' "$output_directory"
