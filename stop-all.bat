@echo off
setlocal EnableExtensions

cd /d "%~dp0"
set "APP_PORT=13826"
set "FOUND=0"

for /f "usebackq tokens=*" %%P in (`powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue; foreach ($connection in $connections) { $connection.OwningProcess }"`) do (
  echo Stopping K5 process tree PID %%P...
  taskkill /PID %%P /T /F >nul 2>&1
  set "FOUND=1"
)

if "%FOUND%"=="0" (
  echo No K5 server is listening on port %APP_PORT%.
  exit /b 0
)

for /l %%N in (1,1,10) do (
  powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue; if ($connections) { exit 1 } else { exit 0 }" >nul 2>&1
  if not errorlevel 1 goto :stopped
  ping 127.0.0.1 -n 2 >nul
)

echo [WARN] Port %APP_PORT% is still in use. Inspect the owning process manually.
exit /b 1

:stopped
echo [OK] K5 backend/frontend stopped.
exit /b 0
