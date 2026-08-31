@echo off
setlocal
cd /d "%~dp0"
set "JAR=target\lexoffice-icpbr-bridge.jar"
if not exist "%JAR%" (echo Ponte ainda nao compilada. Execute build-windows.bat primeiro.& pause & exit /b 1)
if not exist "C:\Windows\System32\aetpkss1.dll" (echo SafeSign PKCS11 nao encontrado em C:\Windows\System32\aetpkss1.dll& pause & exit /b 1)
java -jar "%JAR%"
pause
