#!/usr/bin/env sh
# Consistent backup of the tank: the database and every stored face image live
# in one SQLite file, so `.backup` (which is safe against a running server,
# unlike copying the file) is the whole job.
#
#   ./deploy/backup.sh /path/to/backups
#
# With Docker:
#   docker compose exec -T app node -e "..." > backup.db
set -eu

DEST=${1:-./backups}
DATA_DIR=${FFA_DATA_DIR:-./data}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$DEST"
sqlite3 "$DATA_DIR/aquarium.db" ".backup '$DEST/aquarium-$STAMP.db'"
echo "wrote $DEST/aquarium-$STAMP.db"

# Keep the 14 most recent.
ls -1t "$DEST"/aquarium-*.db 2>/dev/null | tail -n +15 | xargs -r rm --
