# azurite-cli.ps1
# Reusable helpers for testing a local Azurite instance with the official Azure CLI (`az storage`).
#
# Quick start:
#   . .\scripts\azurite-cli.ps1     # dot-source to load the functions into your session
#   Use-Azurite                     # point the Azure CLI at local Azurite (sets connection string)
#   az storage container list -o table
#
# After Use-Azurite, every `az storage ...` command targets Azurite automatically.
#
# Optional convenience wrappers (thin shortcuts over `az storage`):
#   Test-AzuriteBlob                # runs a full blob lifecycle smoke test
#   New-AzuriteContainer mycontainer
#   Send-AzuriteBlob  mycontainer ./file.txt myblob.txt
#   Get-AzuriteBlobs  mycontainer
#   Receive-AzuriteBlob mycontainer myblob.txt ./out.txt

# --- Default Azurite emulator credentials (well-known, safe for local dev only) ---
$script:AzCliAccount = 'devstoreaccount1'
$script:AzCliKey     = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=='
$script:AzCliHost    = '127.0.0.1'

function Use-Azurite {
    <#
        Points the Azure CLI at the local Azurite instance for the current shell session
        by setting AZURE_STORAGE_CONNECTION_STRING (covers Blob, Queue and Table).
    #>
    [CmdletBinding()]
    param(
        [string]$AzHost = $script:AzCliHost,
        [int]$BlobPort  = 10000,
        [int]$QueuePort = 10001,
        [int]$TablePort = 10002
    )

    $cs = @(
        "DefaultEndpointsProtocol=http"
        "AccountName=$script:AzCliAccount"
        "AccountKey=$script:AzCliKey"
        "BlobEndpoint=http://${AzHost}:$BlobPort/$script:AzCliAccount"
        "QueueEndpoint=http://${AzHost}:$QueuePort/$script:AzCliAccount"
        "TableEndpoint=http://${AzHost}:$TablePort/$script:AzCliAccount"
    ) -join ';'

    $env:AZURE_STORAGE_CONNECTION_STRING = $cs
    Write-Host "Azure CLI is now pointed at Azurite ($AzHost  blob:$BlobPort queue:$QueuePort table:$TablePort)." -ForegroundColor Green
    Write-Host "Run any 'az storage ...' command and it will target Azurite." -ForegroundColor DarkGray
}

function Clear-Azurite {
    <# Removes the Azurite connection string so `az` targets real Azure / your login again. #>
    Remove-Item Env:AZURE_STORAGE_CONNECTION_STRING -ErrorAction SilentlyContinue
    Write-Host "Cleared AZURE_STORAGE_CONNECTION_STRING. Azure CLI no longer targets Azurite." -ForegroundColor Yellow
}

function Assert-AzuriteContext {
    if (-not $env:AZURE_STORAGE_CONNECTION_STRING) {
        Write-Host "Connection string not set. Running Use-Azurite for you..." -ForegroundColor Yellow
        Use-Azurite
    }
}

# --- Thin convenience wrappers (entirely optional; plain `az storage` works too) ---

function New-AzuriteContainer {
    param([Parameter(Mandatory)][string]$Name)
    Assert-AzuriteContext
    az storage container create --name $Name --output table
}

function Send-AzuriteBlob {
    param(
        [Parameter(Mandatory)][string]$Container,
        [Parameter(Mandatory)][string]$File,
        [string]$Name
    )
    Assert-AzuriteContext
    if (-not $Name) { $Name = Split-Path $File -Leaf }
    az storage blob upload --container-name $Container --name $Name --file $File --overwrite --output table
}

function Get-AzuriteBlobs {
    param([Parameter(Mandatory)][string]$Container)
    Assert-AzuriteContext
    az storage blob list --container-name $Container --output table
}

function Receive-AzuriteBlob {
    param(
        [Parameter(Mandatory)][string]$Container,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Destination
    )
    Assert-AzuriteContext
    az storage blob download --container-name $Container --name $Name --file $Destination --output none
    Write-Host "Downloaded '$Name' -> '$Destination'" -ForegroundColor Green
}

function Test-AzuriteBlob {
    <# End-to-end blob smoke test: create container, upload, list, download, verify, cleanup. #>
    [CmdletBinding()]
    param([string]$Container = "smoketest$((Get-Random -Maximum 9999))")

    Assert-AzuriteContext
    $tmpDir  = [System.IO.Path]::GetTempPath()   # cross-platform (Windows/Linux/macOS)
    $tmpUp   = Join-Path $tmpDir "azurite-up-$([guid]::NewGuid()).txt"
    $tmpDown = Join-Path $tmpDir "azurite-down-$([guid]::NewGuid()).txt"
    $content = "azurite smoke test @ $(Get-Date -Format o)"

    try {
        Write-Host "`n[1/5] Create container '$Container'" -ForegroundColor Cyan
        az storage container create --name $Container --output table

        Write-Host "`n[2/5] Upload blob 'hello.txt'" -ForegroundColor Cyan
        Set-Content -Path $tmpUp -Value $content -Encoding ascii
        az storage blob upload --container-name $Container --name hello.txt --file $tmpUp --overwrite --output table

        Write-Host "`n[3/5] List blobs" -ForegroundColor Cyan
        az storage blob list --container-name $Container --output table

        Write-Host "`n[4/5] Download blob" -ForegroundColor Cyan
        az storage blob download --container-name $Container --name hello.txt --file $tmpDown --output none
        $roundTrip = (Get-Content $tmpDown -Raw).Trim()
        if ($roundTrip -eq $content) {
            Write-Host "Round-trip OK: content matches." -ForegroundColor Green
        } else {
            Write-Host "Round-trip MISMATCH!`n expected: $content`n got:      $roundTrip" -ForegroundColor Red
        }

        Write-Host "`n[5/5] Cleanup (delete container)" -ForegroundColor Cyan
        az storage container delete --name $Container --output table
        Write-Host "`nSmoke test complete." -ForegroundColor Green
    }
    finally {
        Remove-Item $tmpUp, $tmpDown -ErrorAction SilentlyContinue
    }
}

# When this script is RUN directly (.\scripts\azurite-cli.ps1) it auto-configures the
# connection string and runs a full blob smoke test - no extra input needed.
# When it is DOT-SOURCED (. .\scripts\azurite-cli.ps1) it just loads the functions.
if ($MyInvocation.InvocationName -ne '.') {
    Use-Azurite
    Test-AzuriteBlob
}
else {
    Write-Host "azurite-cli helpers loaded. Run 'Use-Azurite' to begin, then any 'az storage ...' command." -ForegroundColor DarkGray
    Write-Host "Try a full smoke test with: Test-AzuriteBlob" -ForegroundColor DarkGray
}
