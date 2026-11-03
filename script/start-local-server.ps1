$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$serverUrl = 'http://127.0.0.1:5173/'

function Test-LocalServer {
    try {
        $response = Invoke-WebRequest -Uri $serverUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

try {
    if (-not (Test-LocalServer)) {
        $nodePath = (Get-Command node -ErrorAction Stop).Source
        $vitePath = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $vitePath)) {
            throw 'Vite is missing. Run npm install in the project folder first.'
        }

        $serverProcess = Start-Process -FilePath $nodePath -ArgumentList "`"$vitePath`"", '--host', '127.0.0.1', '--port', '5173', '--strictPort' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if (Test-LocalServer) {
                $ready = $true
                break
            }
            if ($serverProcess.HasExited) {
                throw 'The server exited during startup. Run npm run dev in a terminal to see the error.'
            }
            Start-Sleep -Milliseconds 500
        }
        if (-not $ready) {
            throw 'The server did not respond in time. Run npm run dev in a terminal to diagnose startup.'
        }
    }

    Write-Host "Local server running at $serverUrl"
} catch {
    Write-Host "Could not start local server: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
