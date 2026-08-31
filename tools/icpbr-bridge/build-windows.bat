@echo off
setlocal
cd /d "%~dp0"
where mvn >nul 2>nul || (echo Maven nao encontrado. Instale Maven 3.9+ e tente novamente.& pause & exit /b 1)
mvn -q -DskipTests package
if errorlevel 1 (echo Falha ao compilar.& pause & exit /b 1)
echo.
echo Ponte compilada: target\lexoffice-icpbr-bridge.jar
pause
