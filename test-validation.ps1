Write-Host "Testing Input Validation..." -ForegroundColor Green
Write-Host ""

$baseUrl = "http://localhost:3000"

Write-Host "Test 1: Weak password" -ForegroundColor Yellow
$body = @{
    username = "test"
    email = "test@example.com"
    password = "weak"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json
Write-Host ""

Write-Host "Test 2: Invalid email" -ForegroundColor Yellow
$body = @{
    username = "test"
    email = "not-email"
    password = "Strong123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json
Write-Host ""

Write-Host "Test 3: Short username" -ForegroundColor Yellow
$body = @{
    username = "ab"
    email = "test@example.com"
    password = "Strong123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json
Write-Host ""

Write-Host "Test 4: Reserved username" -ForegroundColor Yellow
$body = @{
    username = "admin"
    email = "test@example.com"
    password = "Strong123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json
Write-Host ""

Write-Host "Test 5: Valid registration (should succeed)" -ForegroundColor Yellow
$body = @{
    username = "validuser"
    email = "valid@example.com"
    password = "Strong123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json
Write-Host ""

Write-Host "All tests complete!" -ForegroundColor Green
