#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Opens Windows Firewall so LAN devices can reach the Society Events nginx
    proxy running inside WSL2 (mirrored-networking mode).

.DESCRIPTION
    WSL2 2.0+ uses mirrored networking by default: WSL2 and Windows share the
    same IP address, so no port-proxy is needed. The only requirement is an
    inbound Windows Firewall rule for the nginx port.

    Run with -Remove to undo the firewall rule.

.PARAMETER Port
    The nginx port to allow (default: 8080, matches NGINX_PORT in .env).

.PARAMETER Remove
    Remove the firewall rule instead of adding it.

.EXAMPLE
    # Open port (run as Administrator)
    .\wsl2_port_forward.ps1

.EXAMPLE
    # Undo
    .\wsl2_port_forward.ps1 -Remove
#>

param(
    [int]   $Port   = 8080,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
$RuleName = "WSL2 Society Events (port $Port)"

if ($Remove) {
    Write-Host "Removing firewall rule for port $Port..." -ForegroundColor Cyan
    netsh advfirewall firewall delete rule name="$RuleName" 2>$null
    Write-Host "Done." -ForegroundColor Green
    exit 0
}

# ── Add inbound firewall rule ─────────────────────────────────────────────────
netsh advfirewall firewall delete rule name="$RuleName" 2>$null
netsh advfirewall firewall add rule `
    name="$RuleName" `
    dir=in action=allow protocol=TCP localport=$Port
Write-Host "Firewall rule added: allow inbound TCP $Port" -ForegroundColor Green

# ── Print access info ─────────────────────────────────────────────────────────
$ips = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -notmatch 'Loopback|WSL|vEthernet' } |
    Select-Object -ExpandProperty IPAddress)

Write-Host ""
Write-Host "Society Events is now reachable at:" -ForegroundColor Yellow
foreach ($ip in $ips) {
    Write-Host "  http://${ip}:${Port}/           - Frontend"          -ForegroundColor White
    Write-Host "  http://${ip}:${Port}/auth/      - Keycloak"          -ForegroundColor White
    Write-Host "  http://${ip}:${Port}/pgadmin/   - pgAdmin  (basic auth)" -ForegroundColor White
    Write-Host "  http://${ip}:${Port}/mail/      - Mailpit   (basic auth)" -ForegroundColor White
}
Write-Host ""
Write-Host "To undo: .\wsl2_port_forward.ps1 -Remove" -ForegroundColor DarkYellow
