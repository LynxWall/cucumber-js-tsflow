# Opens a fresh console window, runs console-run.ps1 in it, waits, and prints the log and the rendered screen.
# Usage (from any shell, including Claude's captured PowerShell tool):
#   pwsh -File launch.ps1 -Script C:\path\to\child.js -Out C:\path\to\result.txt [-Columns 40] [-Env "TSFLOW_THEME=lotr;OTHER=1"] [-StderrToConsole]
#
# -StderrToConsole keeps the child's stderr on the console (otherwise it goes to "<Out>.log"). cucumber-tsflow draws
# its startup progress on stderr since 8.0, so pass it whenever the progress or the real CLI is under test.
#
# -Env is a string of KEY=VALUE pairs separated by ";" (a hashtable cannot cross a `pwsh -File` boundary; it
# arrives as the literal text "System.Collections.Hashtable"). The variables are set for the child and
# restored afterwards. Paths inside NODE_OPTIONS must use forward slashes: backslashes are stripped on the
# way through the new process. NO_COLOR is cleared for the child unless -Env sets it: Claude's PowerShell tool
# runs with NO_COLOR=1, which the new console would inherit, and then nothing under test has any colour.
param(
	[Parameter(Mandatory = $true)][string]$Script,
	[Parameter(Mandatory = $true)][string]$Out,
	[int]$Columns = 0,
	[string]$Env = '',
	[switch]$StderrToConsole
)
foreach ($f in @($Out, "$Out.log")) { if (Test-Path $f) { Remove-Item $f } }
$vars = @{ NO_COLOR = '' }
foreach ($pair in ($Env -split ';')) {
	if ($pair.Trim() -eq '') { continue }
	$eq = $pair.IndexOf('=')
	if ($eq -lt 1) { throw "Bad -Env entry '$pair': expected KEY=VALUE" }
	$vars[$pair.Substring(0, $eq).Trim()] = $pair.Substring($eq + 1)
}
$saved = @{}
foreach ($k in $vars.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, $vars[$k]) }
try {
	$runner = Join-Path $PSScriptRoot 'console-run.ps1'
	# -Command, not -File: -File with these paths exited 1 before the script ran.
	$cmd = "& '$runner' -Script '$Script' -Out '$Out' -Columns $Columns"
	if ($StderrToConsole) { $cmd += ' -StderrToConsole' }
	$p = Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd -PassThru -Wait
	"launcher exit=$($p.ExitCode)"
} finally {
	foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
}
"--- log"
if (Test-Path "$Out.log") { Get-Content "$Out.log" } else { "no log: the runner never started (check quoting / execution policy)" }
"--- screen"
if (Test-Path $Out) { Get-Content $Out } else { "no screen dump: see the log" }
