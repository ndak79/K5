@echo off
setlocal EnableExtensions

cd /d "%~dp0"
set "APP_PORT=13826"
set "LOG_DIR=%~dp0logs"
set "LOG_FILE=%LOG_DIR%\app.log"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  exit /b 1
)

if not exist "node_modules" (
  echo [ERROR] Dependencies are missing. Run npm install first.
  exit /b 1
)

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "PORT_IN_USE=0"
for /f "usebackq tokens=*" %%P in (`powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue; foreach ($connection in $connections) { $connection.OwningProcess }"`) do (
  echo [ERROR] Port %APP_PORT% is already in use by PID %%P.
  set "PORT_IN_USE=1"
)
if "%PORT_IN_USE%"=="1" exit /b 1

>>"%LOG_FILE%" echo.
>>"%LOG_FILE%" echo [%date% %time%] Starting K5 backend/frontend on port %APP_PORT%...
start "K5-main backend+frontend" /min /b "%ComSpec%" /d /c "set PORT=%APP_PORT%&& npm run dev >> logs\app.log 2>&1"

echo Starting K5 backend/frontend on http://localhost:%APP_PORT% ...
for /l %%N in (1,1,30) do (
  powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue; if ($connections) { exit 0 } else { exit 1 }" >nul 2>&1
  if not errorlevel 1 goto :ready
  ping 127.0.0.1 -n 2 >nul
)

echo [ERROR] Server did not open port %APP_PORT% within 30 seconds.
echo Check the log: %LOG_FILE%
exit /b 1

:ready
echo [OK] Backend and frontend are running at http://localhost:%APP_PORT%
echo [LOG] %LOG_FILE%
exit /b 0
