param([Parameter(Mandatory=$true)][string]$Commit, [switch]$FullFrameworkSuite, [switch]$FocusedFramework, [string]$RunName="")
$ErrorActionPreference = 'Stop'
$runOutput = if ($RunName) { Join-Path $PSScriptRoot $RunName } else { $PSScriptRoot }
New-Item -ItemType Directory -Force -Path $runOutput | Out-Null
$frameworkRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$siteRoot = (Resolve-Path (Join-Path $frameworkRoot '../site')).Path
$scratchRoot = [IO.Path]::GetFullPath((Join-Path $env:TEMP ('syncloudos-open-panel-' + $Commit.Substring(0,8))))
$temporaryRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (-not $scratchRoot.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Scratch checkout escaped the temporary directory.' }
if (Test-Path -LiteralPath $scratchRoot) { throw 'Scratch checkout already exists.' }
$receipt = [ordered]@{ commit=$Commit; scratch=$scratchRoot; adoption=$null; typecheck=$null; vitest=$null; frameworkTypecheck=$null; frameworkVitest=$null; junctionDeleted=$false; frameworkVitestSurvived=$false; worktreeRemoved=$false }
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
  if ($FocusedFramework) {
    Push-Location $scratchRoot
    try {
      & npx.cmd vitest run tests/nse/file-panels tests/integration/nse-open-panel.test.tsx tests/runtime/open-panel-file-system.test.ts tests/runtime/open-panel-storage.test.ts tests/runtime/open-panel-sheet-attachment.test.tsx tests/runtime/mounted-file-panel-client.test.ts tests/runtime/media-panel-service.test.ts tests/runtime/appkit-counterparts.test.ts tests/runtime/browser-global-boundary.test.ts *> (Join-Path $runOutput 'framework-focused.log')
      $receipt.frameworkFocused = $LASTEXITCODE
    } finally { Pop-Location }
  }
  if ($FullFrameworkSuite) {
    Push-Location $scratchRoot
    try {
      & npx.cmd tsc -b --pretty false *> (Join-Path $runOutput 'frozen-framework-typecheck.log')
      $receipt.frameworkTypecheck = $LASTEXITCODE
      & npx.cmd vitest run *> (Join-Path $runOutput 'frozen-framework-vitest.log')
      $receipt.frameworkVitest = $LASTEXITCODE
    } finally { Pop-Location }
  }
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
  $receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runOutput 'site-adoption.json')
}
$receipt | ConvertTo-Json
