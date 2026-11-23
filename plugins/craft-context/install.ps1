<#
 craft-context Codex plugin installer.
 Idempotent: safe to re-run; skips steps already satisfied.
 #>
param(
  [string]$PluginRoot = "$PSScriptRoot",
  [string]$CodexPluginRoot = "${env:APPDATA}\Codex\plugins\craft-context"
)

$ErrorActionPreference = 'Stop'

Write-Host "craft-context installer: target=$CodexPluginRoot" -ForegroundColor Cyan

# 1. Validate source plugin package exists.
if (!(Test-Path -Path "$PluginRoot\.codex-plugin\plugin.json")) {
  throw "craft-context plugin package not found at $PluginRoot (missing .codex-plugin/plugin.json)"
}

# 2. Create target directory (idempotent).
$null = New-Item -ItemType Directory -Path $CodexPluginRoot -Force | Out-Null

# 3. Copy plugin package into Codex plugin root (idempotent overwrite).
Copy-Item -Path "$PluginRoot\*" -Destination $CodexPluginRoot -Recurse -Force -Exclude node_modules,dist,*.log,*.tmp
Copy-Item -Path "$PluginRoot\dist\plugin\*" -Destination "$CodexPluginRoot\dist\plugin" -Recurse -Force

# 4. Write project-level .craft-codebase.json template into the current workspace if absent.
$workspaceConfig = Join-Path -Path (Get-Location) -ChildPath '.craft-codebase.json'
if (!(Test-Path -Path $workspaceConfig)) {
  Set-Content -Path $workspaceConfig -Value '{"exclude_paths":["generated","private"]}' -Encoding UTF8
  Write-Host "Wrote .craft-codebase.json to workspace" -ForegroundColor Green
} else {
  Write-Host ".craft-codebase.json already exists; left unchanged" -ForegroundColor Gray
}

# 5. Verify installation.
$pluginJson = Join-Path -Path $CodexPluginRoot -ChildPath '.codex-plugin\plugin.json'
if (!(Test-Path -Path $pluginJson)) {
  throw "Installation verification failed: $pluginJson not present"
}

Write-Host "craft-context installed successfully at $CodexPluginRoot" -ForegroundColor Green
Write-Host "Restart Codex to load the plugin hooks." -ForegroundColor Yellow
