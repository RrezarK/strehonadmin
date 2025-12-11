# Route Testing Script for PowerShell
# Usage: .\test-routes.ps1

param(
    [string]$ProjectUrl = "",
    [string]$ApiKey = ""
)

# Configuration
if ([string]::IsNullOrEmpty($ProjectUrl)) {
    Write-Host "Enter your Supabase Project URL (e.g., https://xxxxx.supabase.co):" -ForegroundColor Yellow
    $ProjectUrl = Read-Host
}

if ([string]::IsNullOrEmpty($ApiKey)) {
    Write-Host "Enter your Supabase Anon Key:" -ForegroundColor Yellow
    $ApiKey = Read-Host
}

$baseUrl = "$ProjectUrl/functions/v1/server"
$headers = @{
    "Authorization" = "Bearer $ApiKey"
    "Content-Type" = "application/json"
}

Write-Host "`n🧪 Testing Modular Routes..." -ForegroundColor Cyan
Write-Host "Base URL: $baseUrl`n" -ForegroundColor Gray

# Test endpoints
$endpoints = @(
    @{ Method = "GET"; Path = "/make-server-0bdba248/health"; Auth = $false },
    @{ Method = "GET"; Path = "/make-server-0bdba248/tenants"; Auth = $true },
    @{ Method = "GET"; Path = "/make-server-0bdba248/plans"; Auth = $true },
    @{ Method = "GET"; Path = "/make-server-0bdba248/dashboard/metrics"; Auth = $true },
    @{ Method = "GET"; Path = "/make-server-0bdba248/system/health"; Auth = $true },
    @{ Method = "GET"; Path = "/make-server-0bdba248/status/services"; Auth = $true }
)

$successCount = 0
$failCount = 0

foreach ($endpoint in $endpoints) {
    $url = "$baseUrl$($endpoint.Path)"
    $method = $endpoint.Method
    $needsAuth = $endpoint.Auth
    
    Write-Host "Testing: $method $($endpoint.Path)" -ForegroundColor White
    
    try {
        $requestHeaders = if ($needsAuth) { $headers } else { @{ "Content-Type" = "application/json" } }
        
        $response = Invoke-RestMethod -Uri $url -Method $method -Headers $requestHeaders -ErrorAction Stop
        
        Write-Host "  ✅ Success (200)" -ForegroundColor Green
        if ($response.success -ne $null) {
            Write-Host "  Response: success=$($response.success)" -ForegroundColor Gray
        }
        $successCount++
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode) {
            Write-Host "  ⚠️  Status: $statusCode" -ForegroundColor Yellow
        } else {
            Write-Host "  ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        }
        $failCount++
    }
    Write-Host ""
}

Write-Host "`n📊 Test Summary:" -ForegroundColor Cyan
Write-Host "  ✅ Passed: $successCount" -ForegroundColor Green
Write-Host "  ❌ Failed: $failCount" -ForegroundColor Red
Write-Host "  Total: $($endpoints.Count)`n" -ForegroundColor White

if ($failCount -eq 0) {
    Write-Host "🎉 All tests passed!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some tests failed. Check the errors above." -ForegroundColor Yellow
}


