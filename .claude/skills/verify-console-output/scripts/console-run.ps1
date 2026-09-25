# Runs a node script inside THIS console window, then reads the console screen buffer back cell by cell and
# writes it to a file, so what the terminal actually rendered can be inspected from a tool that has no console.
#
# Launched by the skill through Start-Process (a fresh console window). Do not run it from a captured shell:
# there is no screen buffer to read there.
#
#   -Script   node script to run (absolute path)
#   -Out      file to receive the rendered rows; "<Out>.log" receives host info, node's stderr and exit code
#   -Columns  optional: resize the console to this width first (mode con), to test narrow terminals
#   -Lines    optional: console height when resizing (default 60)
#   -StderrToConsole  optional: leave node's stderr on the console instead of appending it to "<Out>.log";
#             needed for anything that draws on stderr, such as cucumber-tsflow's startup progress since 8.0
param(
	[Parameter(Mandatory = $true)][string]$Script,
	[Parameter(Mandatory = $true)][string]$Out,
	[int]$Columns = 0,
	[int]$Lines = 60,
	[switch]$StderrToConsole
)
$ErrorActionPreference = 'Continue'
try {
	if ($Columns -gt 0) {
		& mode con "cols=$Columns" "lines=$Lines" | Out-Null
		Clear-Host
	}
	"host=$($Host.Name) pid=$PID codepage=$([Console]::OutputEncoding.CodePage) width=$($Host.UI.RawUI.BufferSize.Width)" | Set-Content -Path "$Out.log" -Encoding UTF8
	if ($StderrToConsole) { & node $Script } else { & node $Script 2>> "$Out.log" }
	"node exit=$LASTEXITCODE" | Add-Content -Path "$Out.log" -Encoding UTF8
	$raw = $Host.UI.RawUI
	$cursor = $raw.CursorPosition
	# Read well past the cursor: a renderer that parks the cursor at the TOP of a block it redraws (the startup
	# progress does, so wrapped lines can be redrawn) leaves its output BELOW the cursor. Empty trailing rows are dropped.
	$rows = [Math]::Min($raw.BufferSize.Height - 1, [Math]::Max(1, $cursor.Y + 12))
	$rect = New-Object System.Management.Automation.Host.Rectangle 0, 0, ($raw.BufferSize.Width - 1), $rows
	$cells = $raw.GetBufferContents($rect)
	# Not "$lines": PowerShell variable names are case-insensitive and that would collide with the [int]$Lines parameter
	$rowText = New-Object System.Collections.Generic.List[string]
	for ($y = 0; $y -lt $cells.GetLength(0); $y++) {
		$sb = New-Object System.Text.StringBuilder
		# 2-D arrays must be read with GetValue; "$cells[$y, $x]" is a parse error in Windows PowerShell
		for ($x = 0; $x -lt $cells.GetLength(1); $x++) { $cell = $cells.GetValue($y, $x); [void]$sb.Append($cell.Character) }
		$rowText.Add($sb.ToString().TrimEnd())
	}
	while ($rowText.Count -gt 1 -and $rowText[$rowText.Count - 1] -eq '') { $rowText.RemoveAt($rowText.Count - 1) }
	$rowText | Set-Content -Path $Out -Encoding UTF8
	"width=$($raw.BufferSize.Width) rows=$($rowText.Count) cursor=row $($cursor.Y) col $($cursor.X)" | Add-Content -Path $Out -Encoding UTF8
} catch {
	"ERROR: $($_ | Out-String)" | Add-Content -Path "$Out.log" -Encoding UTF8
}
