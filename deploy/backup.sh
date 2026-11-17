#!/usr/bin/env bash
# پشتیبان‌گیری امن از SQLite (سازگار با WAL) + بررسی سلامت + نگهداشت
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/khabgah}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/khabgah}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_PATH="$APP_DIR/data/dormitory.db"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date +%F-%H%M%S)"
OUT="$BACKUP_DIR/dormitory-$STAMP.db"

# .backup یک نسخهٔ سازگار حتی در حالت WAL تولید می‌کند.
sqlite3 "$DB_PATH" ".backup '$OUT'"
chmod 600 "$OUT"

CHECK="$(sqlite3 "$OUT" 'PRAGMA integrity_check;')"
if [ "$CHECK" != "ok" ]; then
  echo "BACKUP INTEGRITY FAILED: $OUT ($CHECK)" >&2
  exit 1
fi

gzip -f "$OUT"

# حذف بکاپ‌های قدیمی‌تر از بازهٔ نگهداشت
find "$BACKUP_DIR" -maxdepth 1 -name 'dormitory-*.db.gz' -mtime "+$RETENTION_DAYS" -delete

echo "backup ok: $OUT.gz"
