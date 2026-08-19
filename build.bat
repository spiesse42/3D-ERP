@echo off
echo === 3D Print ERP - Build script ===
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
if %errorlevel% neq 0 (
    echo WAARSCHUWING: npm install backend is lokaal mislukt ^(meestal door native modules zoals better-sqlite3 die geen Windows-build kunnen vinden^).
    echo Dit heeft GEEN invloed op de addon zelf: Docker installeert de backend-dependencies opnieuw, voor Linux, tijdens het bouwen in Home Assistant.
    echo Build gaat door...
)

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
echo  Build geslaagd!
echo  Voer nu uit:
echo    git add .
echo    git commit -m "Add built frontend"
echo    git push
echo =========================================
echo.
pause
