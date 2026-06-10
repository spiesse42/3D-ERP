@echo off
setlocal

:: Huidige versie uit config.yaml lezen
for /f "tokens=2 delims=: " %%a in ('findstr "version:" addon\config.yaml') do set VERSIE=%%~a
set VERSIE=%VERSIE:"=%

:: Versie opsplitsen en patch verhogen
for /f "tokens=1,2,3 delims=." %%a in ("%VERSIE%") do (
    set MAJOR=%%a
    set MINOR=%%b
    set /a PATCH=%%c+1
)
set NIEUWE_VERSIE=%MAJOR%.%MINOR%.%PATCH%

echo Versie: %VERSIE% ^> %NIEUWE_VERSIE%

:: Config.yaml bijwerken
powershell -Command "(Get-Content addon\config.yaml) -replace 'version: \"%VERSIE%\"', 'version: \"%NIEUWE_VERSIE%\"' | Set-Content addon\config.yaml"

:: Git
git add .
git commit -m "Deploy v%NIEUWE_VERSIE%"
git push

echo.
echo ================================================
echo  Klaar! Deploy v%NIEUWE_VERSIE% gepusht.
echo  Ga in HA naar de addon en klik Bijwerken.
echo ================================================
echo.
pause
