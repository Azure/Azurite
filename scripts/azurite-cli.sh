#!/usr/bin/env bash
# azurite-cli.sh
# Reusable helpers for testing a local Azurite instance with the official Azure CLI (`az storage`).
# Bash equivalent of scripts/azurite-cli.ps1 — works on Linux, macOS, and WSL (no PowerShell needed).
#
# Quick start:
#   source ./scripts/azurite-cli.sh     # load the functions into your current shell
#   use_azurite                         # point the Azure CLI at local Azurite (sets connection string)
#   az storage container list -o table
#
# After use_azurite, every `az storage ...` command targets Azurite automatically.
#
# Optional convenience wrappers (thin shortcuts over `az storage`):
#   test_azurite_blob                   # runs a full blob lifecycle smoke test
#   test_azurite_queue                  # runs a full queue lifecycle smoke test
#   test_azurite_table                  # runs a full table lifecycle smoke test
#   test_azurite_all                    # runs blob + queue + table smoke tests
#   new_azurite_container mycontainer
#   send_azurite_blob  mycontainer ./file.txt myblob.txt
#   get_azurite_blobs  mycontainer
#   receive_azurite_blob mycontainer myblob.txt ./out.txt

# --- Default Azurite emulator credentials (well-known, safe for local dev only) ---
AZ_CLI_ACCOUNT='devstoreaccount1'
AZ_CLI_KEY='Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=='
AZ_CLI_HOST='127.0.0.1'

# Populated by use_azurite; consumed (explicitly) by every wrapper below.
# NOTE: in WSL `az` is often the Windows az.exe, which does NOT see Linux exported
# env vars. So helpers pass --connection-string "$AZ_CLI_CS" explicitly on every call.
AZ_CLI_CS=''

use_azurite() {
    # Builds the Azurite connection string (covers Blob, Queue and Table) and stores it
    # in AZ_CLI_CS. Also exports AZURE_STORAGE_CONNECTION_STRING for ad-hoc `az` commands.
    # Optional args: host blobPort queuePort tablePort
    local az_host="${1:-$AZ_CLI_HOST}"
    local blob_port="${2:-10000}"
    local queue_port="${3:-10001}"
    local table_port="${4:-10002}"

    AZ_CLI_CS="DefaultEndpointsProtocol=http;AccountName=${AZ_CLI_ACCOUNT};AccountKey=${AZ_CLI_KEY};BlobEndpoint=http://${az_host}:${blob_port}/${AZ_CLI_ACCOUNT};QueueEndpoint=http://${az_host}:${queue_port}/${AZ_CLI_ACCOUNT};TableEndpoint=http://${az_host}:${table_port}/${AZ_CLI_ACCOUNT};"
    export AZURE_STORAGE_CONNECTION_STRING="$AZ_CLI_CS"

    echo "Azure CLI is now pointed at Azurite (${az_host}  blob:${blob_port} queue:${queue_port} table:${table_port})."
    echo "Helpers pass --connection-string explicitly, so this works in WSL too."
}

clear_azurite() {
    # Removes the Azurite connection string so `az` targets real Azure / your login again.
    AZ_CLI_CS=''
    unset AZURE_STORAGE_CONNECTION_STRING
    echo "Cleared Azurite connection string."
}

assert_azurite_context() {
    if [ -z "${AZ_CLI_CS:-}" ]; then
        echo "Connection string not set. Running use_azurite for you..."
        use_azurite
    fi
}

# --- Thin convenience wrappers (entirely optional; plain `az storage` works too) ---

new_azurite_container() {
    # usage: new_azurite_container <name>
    assert_azurite_context
    az storage container create --name "$1" --connection-string "$AZ_CLI_CS" --output table
}

send_azurite_blob() {
    # usage: send_azurite_blob <container> <file> [blob-name]
    assert_azurite_context
    local container="$1" file="$2" name="${3:-}"
    if [ -z "$name" ]; then name="$(basename "$file")"; fi
    az storage blob upload --container-name "$container" --name "$name" --file "$file" --overwrite --connection-string "$AZ_CLI_CS" --output table
}

get_azurite_blobs() {
    # usage: get_azurite_blobs <container>
    assert_azurite_context
    az storage blob list --container-name "$1" --connection-string "$AZ_CLI_CS" --output table
}

receive_azurite_blob() {
    # usage: receive_azurite_blob <container> <blob-name> <destination>
    assert_azurite_context
    az storage blob download --container-name "$1" --name "$2" --file "$3" --connection-string "$AZ_CLI_CS" --output none
    echo "Downloaded '$2' -> '$3'"
}

test_azurite_blob() {
    # End-to-end blob smoke test: create container, upload, list, download, verify, cleanup.
    # usage: test_azurite_blob [container-name]
    assert_azurite_context

    local container="${1:-smoketest$RANDOM}"
    # Use the current directory for temp files so the path is valid for both a
    # Linux-native az and a Windows az.exe invoked from WSL (/mnt/c/...).
    local tmp_up="./.azurite-up-$$-$RANDOM.txt"
    local tmp_down="./.azurite-down-$$-$RANDOM.txt"
    local content="azurite smoke test @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # shellcheck disable=SC2317
    _cleanup() { rm -f "$tmp_up" "$tmp_down"; }
    trap _cleanup RETURN

    echo ""
    echo "[1/5] Create container '$container'"
    az storage container create --name "$container" --connection-string "$AZ_CLI_CS" --output table

    echo ""
    echo "[2/5] Upload blob 'hello.txt'"
    printf '%s' "$content" > "$tmp_up"
    az storage blob upload --container-name "$container" --name hello.txt --file "$tmp_up" --overwrite --connection-string "$AZ_CLI_CS" --output table

    echo ""
    echo "[3/5] List blobs"
    az storage blob list --container-name "$container" --connection-string "$AZ_CLI_CS" --output table

    echo ""
    echo "[4/5] Download blob"
    az storage blob download --container-name "$container" --name hello.txt --file "$tmp_down" --connection-string "$AZ_CLI_CS" --output none
    local round_trip
    round_trip="$(cat "$tmp_down" 2>/dev/null)"
    if [ "$round_trip" = "$content" ]; then
        echo "Round-trip OK: content matches."
    else
        echo "Round-trip MISMATCH!"
        echo " expected: $content"
        echo " got:      $round_trip"
    fi

    echo ""
    echo "[5/5] Cleanup (delete container)"
    az storage container delete --name "$container" --connection-string "$AZ_CLI_CS" --output table
    echo ""
    echo "Smoke test complete."
}

test_azurite_queue() {
    # End-to-end queue smoke test: create queue, enqueue, peek, verify, cleanup.
    # usage: test_azurite_queue [queue-name]
    assert_azurite_context

    local queue="${1:-smoketestq$RANDOM}"
    local content="azurite queue smoke test @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"

    echo ""
    echo "[1/4] Create queue '$queue'"
    az storage queue create --name "$queue" --connection-string "$AZ_CLI_CS" --output table

    echo ""
    echo "[2/4] Enqueue message"
    az storage message put --queue-name "$queue" --content "$content" --connection-string "$AZ_CLI_CS" --output table

    echo ""
    echo "[3/4] Peek and verify message"
    local round_trip
    round_trip="$(az storage message peek --queue-name "$queue" --num-messages 1 --connection-string "$AZ_CLI_CS" --query "[0].content" -o tsv 2>/dev/null | tr -d '\r')"
    if [ "$round_trip" = "$content" ]; then
        echo "Round-trip OK: message content matches."
    else
        echo "Round-trip MISMATCH!"
        echo " expected: $content"
        echo " got:      $round_trip"
    fi

    echo ""
    echo "[4/4] Cleanup (delete queue)"
    az storage queue delete --name "$queue" --connection-string "$AZ_CLI_CS" --output table
    echo ""
    echo "Queue smoke test complete."
}

test_azurite_table() {
    # End-to-end table smoke test: create table, insert entity, query, verify, cleanup.
    # usage: test_azurite_table [table-name]
    assert_azurite_context

    local table="${1:-smoketab$RANDOM}"
    local partition_key="pk$RANDOM"
    local row_key="rk$RANDOM"
    local value="azurite_table_smoke_$(date -u +%Y%m%dT%H%M%SZ)"

    echo ""
    echo "[1/4] Create table '$table'"
    az storage table create --name "$table" --connection-string "$AZ_CLI_CS" --output table

    echo ""
    echo "[2/4] Insert entity"
    az storage entity insert --table-name "$table" --entity PartitionKey="$partition_key" RowKey="$row_key" Message="$value" --connection-string "$AZ_CLI_CS" --output table

    echo ""
    echo "[3/4] Query and verify entity"
    local round_trip
    round_trip="$(az storage entity query --table-name "$table" --filter "PartitionKey eq '$partition_key' and RowKey eq '$row_key'" --select Message --connection-string "$AZ_CLI_CS" --query "items[0].Message" -o tsv 2>/dev/null | tr -d '\r')"
    if [ "$round_trip" = "$value" ]; then
        echo "Round-trip OK: entity value matches."
    else
        echo "Round-trip MISMATCH!"
        echo " expected: $value"
        echo " got:      $round_trip"
    fi

    echo ""
    echo "[4/4] Cleanup (delete table)"
    az storage table delete --name "$table" --connection-string "$AZ_CLI_CS" --output table
    echo ""
    echo "Table smoke test complete."
}

test_azurite_all() {
    # Full Azurite smoke test across Blob, Queue and Table.
    # usage: test_azurite_all
    assert_azurite_context

    test_azurite_blob
    test_azurite_queue
    test_azurite_table
}

# When this script is SOURCED (source ./scripts/azurite-cli.sh) it just loads the functions.
# When it is RUN directly (./scripts/azurite-cli.sh) it auto-configures the connection
# string and runs full blob/queue/table smoke tests - no extra input needed.
if [ -n "${BASH_SOURCE:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; then
    echo "azurite-cli helpers loaded. Run 'use_azurite' to begin, then any 'az storage ...' command."
    echo "Try smoke tests with: test_azurite_blob, test_azurite_queue, test_azurite_table"
    echo "Run all three with: test_azurite_all"
else
    use_azurite
    test_azurite_all
fi
