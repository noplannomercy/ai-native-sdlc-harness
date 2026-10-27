<#
.SYNOPSIS
  AI-native SDLC 하네스를 기존 프로젝트(git 저장소)에 설치한다. 프로젝트 언어는 따지지 않는다 (검증 완료는 Node.js 뿐).

.DESCRIPTION
  kit/ 의 파일을 대상 저장소에 복사하고, .claude/harness.json 을 만들고, git 훅 경로를 .githooks 로 켠다.
  - 기존 파일과 내용이 다르거나 기존 git 훅 설정이 있으면, 아무것도 바꾸지 않고 충돌 목록을 보여 준 뒤 중단한다.
  - 다시 실행해도 안전하다: 이미 같은 파일은 건너뛰고, 사람이 채운 CLAUDE.md·REVIEW.md·harness.json 은 유지한다.
  - 도중에 실패하면 무엇이 만들어졌고 무엇이 남았는지 보여 준다.
  커밋은 하지 않는다.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Target C:\work\my-app
#>
param(
  [Parameter(Mandatory = $true)][string]$Target
)

$ErrorActionPreference = 'Stop'
$Marker = 'ai-native-sdlc-harness'
$UserOwned = @('CLAUDE.md', 'REVIEW.md')   # 설치 후 사람이 고쳐 쓰는 파일: 표식이 있으면 유지
$Utf8 = New-Object System.Text.UTF8Encoding $false

function Stop-Install([string]$msg) {
  Write-Host "설치 중단: $msg" -ForegroundColor Red
  exit 1
}

# 네이티브 명령의 stderr 가 PowerShell 5.1 에서 예외로 바뀌지 않도록 감싼다
function Invoke-Git {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & git -C $Target @args 2>$null
    return [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Out = (($out | Out-String).Trim()) }
  } finally {
    $ErrorActionPreference = $old
  }
}

function Get-NormalizedText([string]$path) {
  return ([System.IO.File]::ReadAllText($path) -replace "`r`n", "`n")
}

# ── 0. 전제 확인 ───────────────────────────────────────────────
foreach ($cmd in 'git', 'node') {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Stop-Install "$cmd 를 찾을 수 없습니다. 설치한 뒤 다시 실행하세요." }
}
$nodeVersion = (& node -v).Trim()
if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 20) { Stop-Install "Node.js 20 이상이 필요합니다 (현재 $nodeVersion)." }

$KitDir = Join-Path $PSScriptRoot 'kit'
if (-not (Test-Path -LiteralPath $KitDir -PathType Container)) { Stop-Install "kit 폴더가 없습니다: $KitDir" }
$KitDir = (Resolve-Path -LiteralPath $KitDir).Path
if (-not (Test-Path -LiteralPath $Target -PathType Container)) { Stop-Install "대상 폴더가 없습니다: $Target" }
$Target = (Resolve-Path -LiteralPath $Target).Path.TrimEnd('\')

$top = Invoke-Git rev-parse --show-toplevel
if (-not $top.Ok) { Stop-Install "대상 폴더가 git 저장소가 아닙니다. 먼저 'git init' 하세요: $Target" }
if ([System.IO.Path]::GetFullPath($top.Out).TrimEnd('\') -ne $Target) {
  Stop-Install "대상은 git 저장소의 최상위 폴더여야 합니다. 최상위: $($top.Out)"
}
if ($Target -eq (Split-Path $KitDir -Parent)) { Stop-Install "하네스 배포 저장소 자체에는 설치하지 않습니다." }

$pkgPath = Join-Path $Target 'package.json'   # 있으면 harness.json 을 npm 명령으로 미리 채운다 (없어도 설치한다)
$conflicts = New-Object System.Collections.Generic.List[string]

# ── 1. 사전 점검 (여기까지는 아무것도 바꾸지 않는다) ─────────────
$plan = New-Object System.Collections.Generic.List[object]
foreach ($f in Get-ChildItem -LiteralPath $KitDir -Recurse -File -Force) {
  $rel = $f.FullName.Substring($KitDir.Length + 1)
  $dst = Join-Path $Target $rel
  $state = 'new'
  if (Test-Path -LiteralPath $dst -PathType Container) {
    $conflicts.Add("$rel — 같은 이름의 폴더가 있습니다")
    $state = 'conflict'
  } elseif (Test-Path -LiteralPath $dst) {
    if ($UserOwned -contains $rel) {
      if ((Get-NormalizedText $dst).Contains($Marker)) { $state = 'keep' }
      else { $conflicts.Add("$rel — 하네스가 만든 파일이 아닙니다 (기존 프로젝트 파일)"); $state = 'conflict' }
    } elseif ((Get-NormalizedText $dst) -eq (Get-NormalizedText $f.FullName)) {
      $state = 'same'
    } else {
      $conflicts.Add("$rel — 이미 있고 내용이 다릅니다")
      $state = 'conflict'
    }
  }
  $plan.Add([pscustomobject]@{ Rel = $rel; Src = $f.FullName; Dst = $dst; State = $state })
}

$cfgPath = Join-Path $Target '.claude\harness.json'
$cfgExists = Test-Path -LiteralPath $cfgPath

$setHooksPath = $false
$hp = (Invoke-Git config --local --get core.hooksPath).Out
if ($hp -eq '') {
  $gitHooks = (Invoke-Git rev-parse --git-path hooks).Out
  if (-not [System.IO.Path]::IsPathRooted($gitHooks)) { $gitHooks = Join-Path $Target $gitHooks }
  $active = @(Get-ChildItem -LiteralPath $gitHooks -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -ne '.sample' })
  if ($active.Count -gt 0) {
    $conflicts.Add("기존 git 훅이 있습니다 ($($active.Name -join ', ')) — 훅 경로를 .githooks 로 바꾸면 꺼집니다")
  }
  $globalHp = (Invoke-Git config --global --get core.hooksPath).Out
  if ($globalHp -ne '') {
    $conflicts.Add("전역 core.hooksPath=$globalHp 가 설정돼 있습니다 — 이 저장소에서 그 훅이 꺼지게 됩니다")
  }
  $setHooksPath = $true
} elseif (($hp -replace '\\', '/').TrimEnd('/') -ne '.githooks') {
  $conflicts.Add("core.hooksPath=$hp 가 이미 설정돼 있습니다 (husky 등) — 하네스 pre-commit 과 함께 쓰려면 사람이 합쳐야 합니다")
}

if ($conflicts.Count -gt 0) {
  Write-Host "충돌이 있어 설치하지 않았습니다. 대상 저장소는 바뀌지 않았습니다." -ForegroundColor Yellow
  foreach ($c in $conflicts) { Write-Host "  - $c" }
  Write-Host ""
  Write-Host "해결 방법은 README.md 의 '설치가 중단될 때'를 보세요. 해결한 뒤 다시 실행하면 됩니다."
  exit 1
}

# ── 2. 설치 ────────────────────────────────────────────────────
$done = New-Object System.Collections.Generic.List[string]
$todo = New-Object System.Collections.Generic.List[string]
foreach ($p in $plan) { if ($p.State -eq 'new') { $todo.Add($p.Rel) } }
if (-not $cfgExists) { $todo.Add('.claude\harness.json') }
foreach ($d in 'intent', 'specs', 'plans') { if (-not (Test-Path -LiteralPath (Join-Path $Target $d))) { $todo.Add("$d\") } }
if ($setHooksPath) { $todo.Add('git config core.hooksPath .githooks') }

try {
  foreach ($p in $plan) {
    if ($p.State -ne 'new') { continue }
    New-Item -ItemType Directory -Force -Path (Split-Path $p.Dst -Parent) | Out-Null
    Copy-Item -LiteralPath $p.Src -Destination $p.Dst
    $done.Add($p.Rel)
  }

  if (-not $cfgExists) {
    $base = 'main'
    if (-not (Invoke-Git rev-parse --verify --quiet refs/heads/main).Ok) {
      if ((Invoke-Git rev-parse --verify --quiet refs/heads/master).Ok) { $base = 'master' }
      else { $cur = (Invoke-Git symbolic-ref --short HEAD).Out; if ($cur) { $base = $cur } }
    }
    $testCmd = ''; $startCmd = ''
    if (Test-Path -LiteralPath $pkgPath) {
      $pkg = [System.IO.File]::ReadAllText($pkgPath) | ConvertFrom-Json
      if ($pkg.scripts) {
        if ($pkg.scripts.test -and $pkg.scripts.test -notmatch 'no test specified') { $testCmd = 'npm test' }
        if ($pkg.scripts.start) { $startCmd = 'npm start' }
      }
    }
    $cfg = [ordered]@{ baseBranch = $base; testCommand = $testCmd; smoke = [ordered]@{ start = $startCmd; url = '' } }
    [System.IO.File]::WriteAllText($cfgPath, (($cfg | ConvertTo-Json -Depth 3) + "`n"), $Utf8)
    $done.Add('.claude\harness.json')
  }

  foreach ($d in 'intent', 'specs', 'plans') {
    $dir = Join-Path $Target $d
    if (-not (Test-Path -LiteralPath $dir)) {
      New-Item -ItemType Directory -Path $dir | Out-Null
      [System.IO.File]::WriteAllText((Join-Path $dir '.gitkeep'), '', $Utf8)
      $done.Add("$d\")
    }
  }

  if ($setHooksPath) {
    if (-not (Invoke-Git config --local core.hooksPath .githooks).Ok) { throw 'git config core.hooksPath 설정 실패' }
    $done.Add('git config core.hooksPath .githooks')
  }
} catch {
  Write-Host "설치 실패: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "부분 설치 상태입니다."
  Write-Host "  만들어진 것 ($($done.Count)):"; foreach ($x in $done) { Write-Host "    + $x" }
  Write-Host "  남은 것:"; foreach ($x in $todo) { if (-not $done.Contains($x)) { Write-Host "    - $x" } }
  Write-Host "원인을 해결하고 다시 실행하면 남은 것만 설치합니다."
  exit 2
}

# ── 3. 결과와 남은 설정 ────────────────────────────────────────
$same = @($plan | Where-Object { $_.State -eq 'same' }).Count
$keep = @($plan | Where-Object { $_.State -eq 'keep' } | ForEach-Object { $_.Rel })
Write-Host "설치 완료: $Target" -ForegroundColor Green
Write-Host "  새로 만듦 $($done.Count) · 이미 같음 $same · 유지 $($keep.Count)$(if ($cfgExists) { ' (+ harness.json 유지)' })"

try { $cfg = [System.IO.File]::ReadAllText($cfgPath) | ConvertFrom-Json }
catch { Stop-Install ".claude\harness.json 이 올바른 JSON 이 아닙니다. 고친 뒤 다시 실행하세요." }
$missing = New-Object System.Collections.Generic.List[string]
if (-not $cfg.testCommand) { $missing.Add('testCommand — 테스트 명령 (예: npm test, mvn test). 비어 있으면 커밋이 막힙니다') }
if ($cfg.smoke -ne $false) {
  if (-not $cfg.smoke.start) { $missing.Add('smoke.start — 앱 기동 명령 (예: npm start, mvn spring-boot:run). 서버가 없는 프로젝트면 smoke 를 false 로') }
  if (-not $cfg.smoke.url) { $missing.Add('smoke.url — 기동 확인 주소 (예: http://localhost:3000/)') }
}
$claudeMd = Join-Path $Target 'CLAUDE.md'
$unfilled = (Get-NormalizedText $claudeMd).Contains('(설치 후 채움')

Write-Host ""
Write-Host "다음 할 일 (사람):"
$n = 1
if ($missing.Count -gt 0) {
  Write-Host "  $n. .claude\harness.json 을 채운다. 비어 있는 항목은 verifier 가 '검증 불가'로 보고합니다:"; $n++
  foreach ($m in $missing) { Write-Host "       - $m" }
}
if ($unfilled) { Write-Host "  $n. CLAUDE.md 의 '(설치 후 채움)' 칸(개요·스택·구조)을 채운다."; $n++ }
Write-Host "  $n. 설치 파일을 커밋한다: git add -A; git commit -m `"harness: AI-native SDLC 하네스 설치`""; $n++
Write-Host "  $n. 대상 폴더에서 claude 를 실행하고, 처음 뜨는 폴더 신뢰 확인을 승인한다 (승인해야 훅이 켜집니다)."
Write-Host ""
Write-Host "사용법: USER_GUIDE.md"
