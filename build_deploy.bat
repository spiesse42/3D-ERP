@echo off
setlocal
echo === 3D Print ERP - Build ^& Deploy ===
echo.

echo [1/4] Frontend dependencies installeren...
cd frontend
call npm install
if %errorlevel% neq 0 ( echo FOUT bij npm install frontend & pause & exit /b 1 )

echo.
echo [2/4] Frontend bouwen...
call npm run build
if %errorlevel% neq 0 ( echo FOUT bij npm run build & pause & exit /b 1 )

echo.
echo [3/4] Backend dependencies installeren...
cd ..\backend
call npm install --omit=dev
if %errorlevel% neq 0 ( echo FOUT bij npm install backend & pause & exit /b 1 )

echo.
echo [4/4] Bestanden kopiëren naar addon...
cd ..
if exist addon\frontend rmdir /s /q addon\frontend
if exist addon\backend rmdir /s /q addon\backend

mkdir addon\frontend\dist
xcopy /e /i /q frontend\dist addon\frontend\dist

mkdir addon\backend
xcopy /e /i /q backend addon\backend

echo.
echo =========================================
echo  Build geslaagd! Bezig met deployen...
echo =========================================
echo.

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
