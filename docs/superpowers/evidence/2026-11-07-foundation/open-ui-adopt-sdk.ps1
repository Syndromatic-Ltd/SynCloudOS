# SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later.
param([Parameter(Mandatory=$true)][string]$Commit)
$ErrorActionPreference = 'Stop'
$frameworkRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$siteRoot = (Resolve-Path (Join-Path $frameworkRoot '../site')).Path
$runOutput = Join-Path $PSScriptRoot 'open-ui-delivery-sdk'
New-Item -ItemType Directory -Force -Path $runOutput | Out-Null
$scratchRoot = [IO.Path]::GetFullPath((Join-Path $env:TEMP ('syncloudos-open-ui-sdk-' + $Commit.Substring(0,8))))
$temporaryRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (-not $scratchRoot.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Scratch checkout escaped the temporary directory.' }
if (Test-Path -LiteralPath $scratchRoot) { throw 'Scratch checkout already exists.' }
$receipt = [ordered]@{ commit=$Commit; scratch=$scratchRoot; adoption=$null; typecheck=$null; vitest=$null; sdkConsumers=$null; junctionDeleted=$false; frameworkVitestSurvived=$false; worktreeRemoved=$false }
& git -C $frameworkRoot worktree add --detach $scratchRoot $Commit
if ($LASTEXITCODE -ne 0) { throw 'Temporary checkout failed.' }
try {
  New-Item -ItemType Junction -Path (Join-Path $scratchRoot 'node_modules') -Target (Join-Path $frameworkRoot 'node_modules') | Out-Null
  Push-Location $siteRoot
  try {
    & node scripts/use-framework.mjs $scratchRoot *> (Join-Path $runOutput 'site-adoption.log')
    $receipt.adoption = $LASTEXITCODE
    if ($receipt.adoption -ne 0) { throw 'Framework adoption failed; inspect site-adoption.log.' }
    & npx.cmd tsc -b --pretty false *> (Join-Path $runOutput 'site-typecheck.log')
    $receipt.typecheck = $LASTEXITCODE
    & npx.cmd vitest run *> (Join-Path $runOutput 'site-vitest.log')
    $receipt.vitest = $LASTEXITCODE
  } finally { Pop-Location }
  Push-Location $scratchRoot
  try {
    & npx.cmd vitest run tests/runtime/synapp-sdk-package.test.ts tests/runtime/nse-file-browser-packed.test.ts --testTimeout 120000 *> (Join-Path $runOutput 'sdk-consumers.log')
    $receipt.sdkConsumers = $LASTEXITCODE
  } finally { Pop-Location }
} finally {
  $junctionPath = Join-Path $scratchRoot 'node_modules'
  if (Test-Path -LiteralPath $junctionPath) {
    $junction = Get-Item -LiteralPath $junctionPath
    if ($junction.LinkType -ne 'Junction') { throw 'Refusing to delete a non-junction node_modules.' }
    $junction.Delete()
  }
  $receipt.junctionDeleted = -not (Test-Path -LiteralPath $junctionPath)
  $receipt.frameworkVitestSurvived = Test-Path -LiteralPath (Join-Path $frameworkRoot 'node_modules/.bin/vitest')
  if (-not $receipt.frameworkVitestSurvived) { throw 'Framework Vitest disappeared; refusing recursive worktree cleanup.' }
  if ([IO.Path]::GetFullPath((Get-Item -LiteralPath $scratchRoot).FullName) -ne $scratchRoot) { throw 'Scratch checkout path changed.' }
  & git -C $frameworkRoot worktree remove --force $scratchRoot
  $receipt.worktreeRemoved = $LASTEXITCODE -eq 0
  $receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runOutput 'adoption.json')
}
$receipt | ConvertTo-Json
