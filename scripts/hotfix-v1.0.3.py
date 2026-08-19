from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


pkg_path = Path("package.json")
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
if pkg["version"] not in {"1.0.2", "1.0.3"}:
    raise RuntimeError(f"unexpected package version: {pkg['version']}")

manager_path = Path("dsh-codex.ps1")
manager = manager_path.read_text(encoding="utf-8-sig")

if "$ManagerScriptName = 'dsh-codex-manager.ps1'" not in manager:
    manager = replace_once(
        manager,
        "$LegacyPackageName = '@wsl043/dsh-codex-subscription'\n",
        "$LegacyPackageName = '@wsl043/dsh-codex-subscription'\n"
        "$ManagerScriptName = 'dsh-codex-manager.ps1'\n"
        "$LegacyManagerScriptName = 'dsh-codex.ps1'\n"
        "$ManagerShimName = 'dsh-codex.cmd'\n",
        "manager constants",
    )

manager = manager.replace("$PackageVersion = '1.0.2'", "$PackageVersion = '1.0.3'")
manager = manager.replace(
    "/releases/download/v1.0.2/dsh-codex-subscription.tgz",
    "/releases/download/v1.0.3/dsh-codex-subscription.tgz",
)

# The PATH directory must not contain a PowerShell script with the same basename
# as the user-facing command. Otherwise PowerShell resolves dsh-codex.ps1 before
# dsh-codex.cmd and ExecutionPolicy blocks the command before the shim can apply
# its process-scoped Bypass.
manager = manager.replace(
    "$installedScript = Join-Path $Directory 'dsh-codex.ps1'",
    "$installedScript = Join-Path $Directory $ManagerScriptName",
)
manager = manager.replace(
    "$installedShim = Join-Path $Directory 'dsh-codex.cmd'",
    "$installedShim = Join-Path $Directory $ManagerShimName",
)
manager = manager.replace(
    "[System.IO.File]::WriteAllText((Join-Path $Directory 'dsh-codex.cmd'), $shim, [System.Text.Encoding]::ASCII)",
    "[System.IO.File]::WriteAllText((Join-Path $Directory $ManagerShimName), $shim, [System.Text.Encoding]::ASCII)",
)
manager = manager.replace(
    "foreach ($ownedFile in @('dsh-codex.ps1', 'dsh-codex.cmd')) {",
    "foreach ($ownedFile in @($ManagerScriptName, $LegacyManagerScriptName, $ManagerShimName)) {",
)
manager = manager.replace(
    "    Remove-Item -LiteralPath (Join-Path $directory 'dsh-codex.ps1') -Force -ErrorAction SilentlyContinue\n"
    "    Remove-Item -LiteralPath (Join-Path $directory 'dsh-codex.cmd') -Force -ErrorAction SilentlyContinue\n",
    "    foreach ($name in @('dsh-codex-manager.ps1', 'dsh-codex.ps1', 'dsh-codex.cmd')) {\n"
    "        Remove-Item -LiteralPath (Join-Path $directory $name) -Force -ErrorAction SilentlyContinue\n"
    "    }\n",
)
manager = manager.replace(
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dsh-codex.ps1" -Managed %*',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dsh-codex-manager.ps1" -Managed %*',
)

legacy_cleanup = """    $legacyInstalledScript = Join-Path $Directory $LegacyManagerScriptName
    if (Test-Path -LiteralPath $legacyInstalledScript -PathType Leaf) {
        Remove-Item -LiteralPath $legacyInstalledScript -Force
    }

"""
if legacy_cleanup not in manager:
    manager = replace_once(
        manager,
        "    $shim = @'\n",
        legacy_cleanup + "    $shim = @'\n",
        "legacy installed manager cleanup",
    )

# Refuse to write a half-migrated manager.
required_manager_fragments = [
    "$ManagerScriptName = 'dsh-codex-manager.ps1'",
    "$LegacyManagerScriptName = 'dsh-codex.ps1'",
    '"%~dp0dsh-codex-manager.ps1"',
    "foreach ($ownedFile in @($ManagerScriptName, $LegacyManagerScriptName, $ManagerShimName))",
    "$PackageVersion = '1.0.3'",
    "/releases/download/v1.0.3/dsh-codex-subscription.tgz",
]
for fragment in required_manager_fragments:
    if fragment not in manager:
        raise RuntimeError(f"missing manager fragment after patch: {fragment}")
manager_path.write_text(manager, encoding="utf-8")

pkg["version"] = "1.0.3"
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

for filename in ["AGENTS.md", "tests/release-contract.test.mjs", "tests/powershell-manager.test.mjs"]:
    path = Path(filename)
    text = path.read_text(encoding="utf-8-sig")
    text = text.replace("1\\.0\\.2", "1\\.0\\.3").replace("1.0.2", "1.0.3")
    path.write_text(text, encoding="utf-8")

tests_path = Path("tests/powershell-manager.test.mjs")
tests = tests_path.read_text(encoding="utf-8")
tests = tests.replace(
    "assert.equal(existsSync(join(commandRoot, 'dsh-codex.ps1')), true)\n"
    "    assert.equal(existsSync(join(commandRoot, 'dsh-codex.cmd')), true)",
    "assert.equal(existsSync(join(commandRoot, 'dsh-codex-manager.ps1')), true)\n"
    "    assert.equal(existsSync(join(commandRoot, 'dsh-codex.ps1')), false)\n"
    "    assert.equal(existsSync(join(commandRoot, 'dsh-codex.cmd')), true)",
)
tests = tests.replace(
    "assert.equal(existsSync(join(commandRoot, 'dsh-codex.ps1')), false)\n"
    "    assert.equal(existsSync(join(commandRoot, 'dsh-codex.cmd')), false)",
    "assert.equal(existsSync(join(commandRoot, 'dsh-codex-manager.ps1')), false)\n"
    "    assert.equal(existsSync(join(commandRoot, 'dsh-codex.ps1')), false)\n"
    "    assert.equal(existsSync(join(commandRoot, 'dsh-codex.cmd')), false)",
)

if "bare dsh-codex uses the cmd shim under Restricted execution policy" not in tests:
    marker = "windowsTest('reusable command uninstalls the portable plugin and removes itself', () => {"
    if tests.count(marker) != 1:
        raise RuntimeError(f"test insertion marker count: {tests.count(marker)}")
    block = r'''windowsTest('bare dsh-codex uses the cmd shim under Restricted execution policy', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-codex-command-resolution-'))
  const root = join(sandbox, 'DSH Portable')
  const commandRoot = join(sandbox, 'command')
  try {
    functionalPortableFixture(root)
    mkdirSync(commandRoot, { recursive: true })
    writeFileSync(join(commandRoot, 'dsh-codex.ps1'), "throw 'legacy manager should have been removed'\n")
    const install = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'),
      '-Action', 'Install', '-PortableRoot', root,
      '-CommandRoot', commandRoot, '-NoModifyPath',
    ], { encoding: 'utf8' })
    assert.equal(install.status, 0, install.stderr || install.stdout)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex.cmd')), true)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex-manager.ps1')), true)
    assert.equal(existsSync(join(commandRoot, 'dsh-codex.ps1')), false)

    const bare = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Restricted',
      '-Command', 'dsh-codex',
    ], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${commandRoot};${process.env.PATH}` },
    })
    assert.equal(bare.status, 0, bare.stderr || bare.stdout)
    assert.match(bare.stdout, /dsh-codex <install\|update\|uninstall>/iu)
    assert.doesNotMatch(bare.stderr, /running scripts is disabled|PSSecurityException/iu)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

'''
    tests = tests.replace(marker, block + marker)

if "bare dsh-codex uses the cmd shim under Restricted execution policy" not in tests:
    raise RuntimeError("restricted PowerShell regression test was not installed")
tests_path.write_text(tests, encoding="utf-8")

print("v1.0.3 hotfix patch prepared successfully")
