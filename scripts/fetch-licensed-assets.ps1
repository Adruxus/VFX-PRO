param(
    [string]$AssetRoot = "public/licensed-assets",
    [string]$ArchiveRoot = ".cache/asset-archives"
)

$ErrorActionPreference = "Stop"

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Safe-Name {
    param([string]$Value)
    return ($Value -replace "[^a-zA-Z0-9._-]", "_")
}

function Get-ItchPackDescriptor {
    param(
        [string]$Domain,
        [string]$Slug
    )

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $downloadInfo = (Invoke-WebRequest -UseBasicParsing -Method Post -WebSession $session -Uri "https://$Domain/$Slug/download_url").Content | ConvertFrom-Json
    $downloadPageUrl = $downloadInfo.url
    if (-not $downloadPageUrl) {
        throw "No download page URL for $Domain/$Slug"
    }

    $page = Invoke-WebRequest -UseBasicParsing -WebSession $session -Uri $downloadPageUrl
    $html = $page.Content

    $csrf = [regex]::Match($html, 'meta name="csrf_token" value="([^"]+)"').Groups[1].Value
    if (-not $csrf) {
        throw "Unable to parse CSRF token for $Domain/$Slug"
    }

    $uploads = @()
    $pattern = '<a[^>]*class="button download_btn"[^>]*data-upload_id="([0-9]+)"[^>]*>Download<\/a>.*?<strong class="name" title="([^"]+)"'
    foreach ($match in [regex]::Matches($html, $pattern)) {
        $uploads += [pscustomobject]@{
            UploadId = $match.Groups[1].Value
            FileName = $match.Groups[2].Value
        }
    }

    if ($uploads.Count -eq 0) {
        # fallback pattern for variant DOM ordering
        $fallbackIds = [regex]::Matches($html, 'data-upload_id="([0-9]+)"')
        foreach ($match in $fallbackIds) {
            $uploads += [pscustomobject]@{
                UploadId = $match.Groups[1].Value
                FileName = "upload_$($match.Groups[1].Value).zip"
            }
        }
    }

    if ($uploads.Count -eq 0) {
        throw "No upload entries found for $Domain/$Slug"
    }

    return [pscustomobject]@{
        Session = $session
        Csrf = $csrf
        Uploads = $uploads
        Domain = $Domain
        Slug = $Slug
    }
}

function Download-ItchPack {
    param(
        [string]$Domain,
        [string]$Slug,
        [string]$ProviderName
    )

    $descriptor = Get-ItchPackDescriptor -Domain $Domain -Slug $Slug
    $providerFolder = Join-Path $AssetRoot (Safe-Name $ProviderName)
    $packFolder = Join-Path $providerFolder (Safe-Name $Slug)
    $archiveFolder = Join-Path $ArchiveRoot (Safe-Name "$ProviderName-$Slug")
    Ensure-Directory $providerFolder
    Ensure-Directory $packFolder
    Ensure-Directory $archiveFolder

    foreach ($upload in $descriptor.Uploads) {
        $query = "source=game_download&after_download_lightbox=1&as_props=1"
        $fileEndpoint = "https://$Domain/$Slug/file/$($upload.UploadId)?$query"
        $response = (Invoke-WebRequest -UseBasicParsing -Method Post -WebSession $descriptor.Session -Uri $fileEndpoint -Body @{ csrf_token = $descriptor.Csrf }).Content | ConvertFrom-Json
        if (-not $response.url) {
            Write-Warning "Skipping $Domain/$Slug upload $($upload.UploadId): no URL in response."
            continue
        }

        $fileName = Safe-Name $upload.FileName
        if (-not $fileName) {
            $fileName = "upload_$($upload.UploadId).zip"
        }
        $archivePath = Join-Path $archiveFolder $fileName

        if (-not (Test-Path $archivePath)) {
            Write-Output "Downloading itch pack $Domain/$Slug -> $fileName"
            Invoke-WebRequest -UseBasicParsing -WebSession $descriptor.Session -Uri $response.url -OutFile $archivePath
        } else {
            Write-Output "Skipping existing itch archive $archivePath"
        }

        $extension = [IO.Path]::GetExtension($archivePath).ToLowerInvariant()
        if ($extension -eq ".zip") {
            $extractPath = Join-Path $packFolder ([IO.Path]::GetFileNameWithoutExtension($fileName))
            if (-not (Test-Path $extractPath)) {
                Ensure-Directory $extractPath
                Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath -Force
            }
        }
    }
}

function Download-And-ExtractZip {
    param(
        [string]$Url,
        [string]$Provider,
        [string]$PackName
    )

    $providerFolder = Join-Path $AssetRoot (Safe-Name $Provider)
    $packFolder = Join-Path $providerFolder (Safe-Name $PackName)
    $archiveFolder = Join-Path $ArchiveRoot (Safe-Name $Provider)
    Ensure-Directory $providerFolder
    Ensure-Directory $packFolder
    Ensure-Directory $archiveFolder

    $archiveName = [IO.Path]::GetFileName(([Uri]$Url).AbsolutePath)
    if (-not $archiveName.EndsWith(".zip")) {
        $archiveName = "$archiveName.zip"
    }
    $archivePath = Join-Path $archiveFolder (Safe-Name $archiveName)

    if (-not (Test-Path $archivePath)) {
        Write-Output "Downloading open library pack $Provider/$PackName"
        Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $archivePath
    } else {
        Write-Output "Skipping existing open library archive $archivePath"
    }
    if (-not (Get-ChildItem -Path $packFolder -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1)) {
        Expand-Archive -LiteralPath $archivePath -DestinationPath $packFolder -Force
    }
}

function Copy-ModelFiles {
    param(
        [string]$SourceRoot,
        [string]$TargetRoot,
        [int]$MaxFiles = 300
    )

    Ensure-Directory $TargetRoot
    $extensions = @(".glb", ".gltf", ".fbx", ".obj", ".png", ".jpg", ".jpeg", ".webp")
    $files = Get-ChildItem -Path $SourceRoot -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() } |
        Select-Object -First $MaxFiles

    foreach ($file in $files) {
        $relative = $file.FullName.Substring($SourceRoot.Length).TrimStart("\", "/")
        $dest = Join-Path $TargetRoot $relative
        $destDir = Split-Path -Parent $dest
        Ensure-Directory $destDir
        Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
    }
}

Ensure-Directory $AssetRoot
Ensure-Directory $ArchiveRoot

$itchPacks = @(
    @{ Domain = "quaternius.itch.io"; Slug = "medieval-village-megakit"; Provider = "itch-quaternius" },
    @{ Domain = "quaternius.itch.io"; Slug = "fantasy-props-megakit"; Provider = "itch-quaternius" },
    @{ Domain = "quaternius.itch.io"; Slug = "modular-sci-fi-megakit"; Provider = "itch-quaternius" },
    @{ Domain = "quaternius.itch.io"; Slug = "stylized-nature-megakit"; Provider = "itch-quaternius" },
    @{ Domain = "quaternius.itch.io"; Slug = "universal-base-characters"; Provider = "itch-quaternius" },
    @{ Domain = "quaternius.itch.io"; Slug = "lowpoly-cars"; Provider = "itch-quaternius" },
    @{ Domain = "quaternius.itch.io"; Slug = "lowpoly-spaceships"; Provider = "itch-quaternius" },
    @{ Domain = "quaternius.itch.io"; Slug = "lowpoly-modular-dungeon-pack"; Provider = "itch-quaternius" },
    @{ Domain = "quaternius.itch.io"; Slug = "lowpoly-medieval-weapons"; Provider = "itch-quaternius" },
    @{ Domain = "quaternius.itch.io"; Slug = "ultimate-platformer-pack"; Provider = "itch-quaternius" }
)

$openLibraryPacks = @(
    @{ Url = "https://github.com/KhronosGroup/glTF-Sample-Assets/archive/refs/heads/main.zip"; Provider = "github-khronos"; Pack = "gltf-sample-assets" }
)

foreach ($pack in $itchPacks) {
    try {
        Download-ItchPack -Domain $pack.Domain -Slug $pack.Slug -ProviderName $pack.Provider
    } catch {
        Write-Warning "Failed itch download $($pack.Domain)/$($pack.Slug): $($_.Exception.Message)"
    }
}

foreach ($pack in $openLibraryPacks) {
    try {
        Download-And-ExtractZip -Url $pack.Url -Provider $pack.Provider -PackName $pack.Pack
    } catch {
        Write-Warning "Failed open library download $($pack.Provider)/$($pack.Pack): $($_.Exception.Message)"
    }
}

# Normalize extracted GitHub sources into flattened render-ready folders (limit to avoid huge repo bloat).
$khronosAssetsSource = Join-Path $AssetRoot "github-khronos/gltf-sample-assets"
$khronosAssetsTarget = Join-Path $AssetRoot "github-khronos-optimized/gltf-sample-assets"
if (Test-Path $khronosAssetsSource) {
    Copy-ModelFiles -SourceRoot $khronosAssetsSource -TargetRoot $khronosAssetsTarget -MaxFiles 240
}

Write-Output "Asset fetch complete."
