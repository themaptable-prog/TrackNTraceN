@echo off
setlocal
cd /d "%~dp0"
set "TNT_RUNTIME=runtime\x64\python.exe"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "TNT_RUNTIME=runtime\arm64\python.exe"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "TNT_RUNTIME=runtime\arm64\python.exe"
if exist "%TNT_RUNTIME%" (
  "%TNT_RUNTIME%" "lan_host.py" %*
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3 "lan_host.py" %*
  ) else (
    where python >nul 2>nul
    if errorlevel 1 (
      echo Extract the entire host ZIP before running this launcher.
    ) else (
      python "lan_host.py" %*
    )
  )
)
pause
