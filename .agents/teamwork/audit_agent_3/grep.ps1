param([string]$Pattern, [int]$Context = 0)
$path = "C:\Users\migue\.gemini\antigravity\scratch\fintrack\index.html"
$lines = [System.IO.File]::ReadAllLines($path)
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match $Pattern) {
        $start = [Math]::Max(0, $i - $Context)
        $end = [Math]::Min($lines.Length - 1, $i + $Context)
        Write-Host "--- Match at line $($i + 1) ---"
        for ($j = $start; $j -le $end; $j++) {
            Write-Host ("{0,5}: {1}" -f ($j + 1), $lines[$j])
        }
    }
}
