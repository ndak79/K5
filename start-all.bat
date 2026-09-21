@echo off
setlocal EnableExtensions

cd /d "%~dp0"
set "APP_PORT=13826"
set "LOG_DIR=%~dp0logs"
set "LOG_FILE=%LOG_DIR%\app.log"
set "APP_URL=http://localhost:%APP_PORT%"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Khong tim thay Node.js trong PATH.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Khong tim thay npm trong PATH.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [ERROR] Chua cai dat thu vien node_modules. Vui long chay npm install truoc.
  pause
  exit /b 1
)

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "ALREADY_RUNNING=0"
for /f "usebackq tokens=*" %%P in (`powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue; foreach ($connection in $connections) { $connection.OwningProcess }"`) do (
  set "ALREADY_RUNNING=1"
)

if "%ALREADY_RUNNING%"=="1" goto :already_running

>>"%LOG_FILE%" echo.
>>"%LOG_FILE%" echo [%date% %time%] Khoi dong K5 backend/frontend tren port %APP_PORT%...

start "K5-main backend+frontend" /min /b "%ComSpec%" /d /c "set PORT=%APP_PORT%&& npm run dev >> logs\app.log 2>&1"

echo Dang khoi dong K5 tai %APP_URL% ...
for /l %%N in (1,1,30) do (
  powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue; if ($connections) { exit 0 } else { exit 1 }" >nul 2>&1
  if not errorlevel 1 goto :ready
  ping 127.0.0.1 -n 2 >nul
)

echo [ERROR] May chu khong the mo cong %APP_PORT% trong vong 30 giay.
echo Vui long kiem tra file log tai: %LOG_FILE%
pause
exit /b 1

:already_running
echo [OK] May chu dang chay san tai %APP_URL% - Port %APP_PORT%.
echo Dang mo trinh duyet...
start "" "%APP_URL%"
exit /b 0

:ready
echo [OK] May chu da san sang tai %APP_URL%
echo [LOG] %LOG_FILE%
echo Dang mo trinh duyet tu dong...
start "" "%APP_URL%"
exit /b 0
