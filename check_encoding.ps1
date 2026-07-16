$files = Get-ChildItem 'c:\Users\hp\Documents\Gestion Pharmacie sen-csu\frontend\src\app' -Recurse -Include '*.html','*.ts'
foreach ($f in $files) {
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    for ($i=0; $i -lt $bytes.Length; $i++) {
        $b = $bytes[$i]
        # Latin-1 accented chars (0x80-0xFF) that are NOT valid UTF-8 lead bytes
        if ($b -eq 0xE9 -or $b -eq 0xE8 -or $b -eq 0xEA -or $b -eq 0xE0 -or $b -eq 0xF4) {
            # Check if it's part of a UTF-8 sequence (preceded by C3)
            if ($i -gt 0 -and $bytes[$i-1] -eq 0xC3) {
                continue
            }
            Write-Host "LATIN1: $($f.FullName)"
            break
        }
    }
}
