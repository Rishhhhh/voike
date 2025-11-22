@echo off
REM VOIKE Windows Installer - Adds Python Scripts to PATH

echo.
echo ========================================
echo   VOIKE Windows PATH Setup
echo ========================================
echo.

REM Get Python Scripts directory
for /f "delims=" %%i in ('python -c "import site; print(site.USER_BASE + '\\Scripts')"') do set SCRIPTS_DIR=%%i

echo Python Scripts directory: %SCRIPTS_DIR%
echo.

REM Check if already in PATH
echo %PATH% | findstr /C:"%SCRIPTS_DIR%" >nul
if %errorlevel%==0 (
    echo Scripts directory is already in PATH!
    echo.
    goto :test
)

REM Ask user
echo This will add Python Scripts to your PATH.
set /p CONFIRM="Add to PATH? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo Cancelled.
    goto :end
)

REM Add to user PATH (permanent)
setx PATH "%PATH%;%SCRIPTS_DIR%"

echo.
echo ✓ Added to PATH!
echo.
echo IMPORTANT: Close this terminal and open a new one for changes to take effect.
echo.

:test
echo Testing voike command...
python -m voike --version
echo.
echo If you see the version above, voike is working!
echo.
echo After restarting your terminal, you can use: voike --version
echo.

:end
pause
