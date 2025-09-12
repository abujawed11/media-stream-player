# Get current directory (where the ps1 file is located)
$base = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Define project root and subfolders
$serverRoot = Join-Path $base "stream-server"
$webRoot    = Join-Path $base "stream-web"

# Create main folders
New-Item -ItemType Directory -Force -Path $serverRoot | Out-Null
New-Item -ItemType Directory -Force -Path $webRoot    | Out-Null

# Subfolders under stream-server
$folders = @(
    "nginx",
    "pm2",
    "scripts",
    "src",
    "src/config",
    "src/controllers",
    "src/jobs",
    "src/middlewares",
    "src/routes",
    "src/services",
    "src/services/packager",
    "src/storage/segments/hls",
    "src/storage/segments/dash",
    "src/storage/thumbnails",
    "src/storage/tmp",
    "src/typings",
    "src/utils",
    "src/workers"
)

foreach ($folder in $folders) {
    New-Item -ItemType Directory -Force -Path (Join-Path $serverRoot $folder) | Out-Null
}

# Empty files under stream-server
$files = @(
    ".env",
    "package.json",
    "package-lock.json",
    "README.md",
    "tsconfig.json",
    "setup-structure.ps1",
    "nginx/nginx.conf",
    "pm2/ecosystem.config.js",
    "scripts/dev-clean.ps1",
    "scripts/ffmpeg-check.ps1",
    "scripts/seed-demo.ps1",
    "src/app.ts",
    "src/server.ts",
    "src/config/constants.ts",
    "src/config/env.ts",
    "src/config/logger.ts",
    "src/controllers/proxy.controller.ts",
    "src/controllers/stream.controller.ts",
    "src/jobs/cleanup.job.ts",
    "src/jobs/prefetch.job.ts",
    "src/middlewares/auth.middleware.ts",
    "src/middlewares/cors.middleware.ts",
    "src/middlewares/error.middleware.ts",
    "src/middlewares/ratelimit.middleware.ts",
    "src/routes/health.routes.ts",
    "src/routes/index.ts",
    "src/routes/proxy.routes.ts",
    "src/routes/stream.routes.ts",
    "src/services/cache.service.ts",
    "src/services/decision.service.ts",
    "src/services/packager/dashPackager.ts",
    "src/services/packager/hlsPackager.ts",
    "src/services/probe.service.ts",
    "src/services/proxy.service.ts",
    "src/services/subtitle.service.ts",
    "src/services/thumbnail.service.ts",
    "src/services/transcoder.service.ts",
    "src/utils/ffmpeg.ts",
    "src/utils/files.ts",
    "src/utils/ids.ts",
    "src/utils/ranges.ts",
    "src/utils/seedr.ts"
)

foreach ($file in $files) {
    $path = Join-Path $serverRoot $file
    if (-not (Test-Path $path)) {
        New-Item -ItemType File -Force -Path $path | Out-Null
    }
}
