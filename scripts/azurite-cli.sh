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
#   new_azurite_container mycontainer
#   send_azurite_blob  mycontainer ./file.txt myblob.txt
#   get_azurite_blobs  mycontainer
#   receive_azurite_blob mycontainer myblob.txt ./out.txt

# --- Default Azurite emulator credentials (well-known, safe for local dev only) ---
AZ_CLI_ACCOUNT='devstoreaccount1'
AZ_CLI_KEY='Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=='
AZ_CLI_HOST='127.0.0.1'

use_azurite() {
    # Points the Azure CLI at local Azurite by setting AZURE_STORAGE_CONNECTION_STRING
    # (covers Blob, Queue and Table). Optional args: host blobPort queuePort tablePort
    local az_host="${1:-$AZ_CLI_HOST}"
    local blob_port="${2:-10000}"
    local queue_port="${3:-10001}"
    local table_port="${4:-10002}"

    export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=${AZ_CLI_ACCOUNT};AccountKey=${AZ_CLI_KEY};BlobEndpoint=http://${az_host}:${blob_port}/${AZ_CLI_ACCOUNT};QueueEndpoint=http://${az_host}:${queue_port}/${AZ_CLI_ACCOUNT};TableEndpoint=http://${az_host}:${table_port}/${AZ_CLI_ACCOUNT};"

    echo "Azure CLI is now pointed at Azurite (${az_host}  blob:${blob_port} queue:${queue_port} table:${table_port})."
    echo "Run any 'az storage ...' command and it will target Azurite."
}

clear_azurite() {
    # Removes the Azurite connection string so `az` targets real Azure / your login again.
    unset AZURE_STORAGE_CONNECTION_STRING
    echo "Cleared AZURE_STORAGE_CONNECTION_STRING. Azure CLI no longer targets Azurite."
}

assert_azurite_context() {
    if [ -z "${AZURE_STORAGE_CONNECTION_STRING:-}" ]; then
        echo "Connection string not set. Running use_azurite for you..."
        use_azurite
    fi
}

# --- Thin convenience wrappers (entirely optional; plain `az storage` works too) ---

new_azurite_container() {
    # usage: new_azurite_container <name>
    assert_azurite_context
    az storage container create --name "$1" --output table
}

send_azurite_blob() {
    # usage: send_azurite_blob <container> <file> [blob-name]
    assert_azurite_context
    local container="$1" file="$2" name="${3:-}"
    if [ -z "$name" ]; then name="$(basename "$file")"; fi
    az storage blob upload --container-name "$container" --name "$name" --file "$file" --overwrite --output table
}

get_azurite_blobs() {
    # usage: get_azurite_blobs <container>
    assert_azurite_context
    az storage blob list --container-name "$1" --output table
}

receive_azurite_blob() {
    # usage: receive_azurite_blob <container> <blob-name> <destination>
    assert_azurite_context
    az storage blob download --container-name "$1" --name "$2" --file "$3" --output none
    echo "Downloaded '$2' -> '$3'"
}

test_azurite_blob() {
    # End-to-end blob smoke test: create container, upload, list, download, verify, cleanup.
    # usage: test_azurite_blob [container-name]
    assert_azurite_context

    local container="${1:-smoketest$RANDOM}"
    local tmp_dir="${TMPDIR:-/tmp}"
    local tmp_up="${tmp_dir%/}/azurite-up-$$-$RANDOM.txt"
    local tmp_down="${tmp_dir%/}/azurite-down-$$-$RANDOM.txt"
    local content="azurite smoke test @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # shellcheck disable=SC2317
    _cleanup() { rm -f "$tmp_up" "$tmp_down"; }
    trap _cleanup RETURN

    echo ""
    echo "[1/5] Create container '$container'"
    az storage container create --name "$container" --output table

    echo ""
    echo "[2/5] Upload blob 'hello.txt'"
    printf '%s' "$content" > "$tmp_up"
    az storage blob upload --container-name "$container" --name hello.txt --file "$tmp_up" --overwrite --output table

    echo ""
    echo "[3/5] List blobs"
    az storage blob list --container-name "$container" --output table

    echo ""
    echo "[4/5] Download blob"
    az storage blob download --container-name "$container" --name hello.txt --file "$tmp_down" --output none
    local round_trip
    round_trip="$(cat "$tmp_down")"
    if [ "$round_trip" = "$content" ]; then
        echo "Round-trip OK: content matches."
    else
        echo "Round-trip MISMATCH!"
        echo " expected: $content"
        echo " got:      $round_trip"
    fi

    echo ""
    echo "[5/5] Cleanup (delete container)"
    az storage container delete --name "$container" --output table
    echo ""
    echo "Smoke test complete."
}

# When this script is SOURCED (source ./scripts/azurite-cli.sh) it just loads the functions.
# When it is RUN directly (./scripts/azurite-cli.sh) it auto-configures the connection
# string and runs a full blob smoke test - no extra input needed.
if [ -n "${BASH_SOURCE:-}" ] && [ "${BASH_SOURCE[0]}" != "${0}" ]; then
    echo "azurite-cli helpers loaded. Run 'use_azurite' to begin, then any 'az storage ...' command."
    echo "Try a full smoke test with: test_azurite_blob"
else
    use_azurite
    test_azurite_blob
fi
