@echo off
setlocal
cd /d "%~dp0"
set "JAR=target\lexoffice-icpbr-bridge.jar"
if not exist "%JAR%" (echo Ponte ainda nao compilada. Execute build-windows.bat primeiro.& pause & exit /b 1)
if "%LEXOFFICE_KEYSTORE_TYPE%"=="" set "LEXOFFICE_KEYSTORE_TYPE=PKCS11"
if "%LEXOFFICE_PKCS11_DLL%"=="" set "LEXOFFICE_PKCS11_DLL=C:\Windows\System32\aetpkss1.dll"
if /I "%LEXOFFICE_KEYSTORE_TYPE%"=="PKCS11" if not exist "%LEXOFFICE_PKCS11_DLL%" (echo SafeSign PKCS11 nao encontrado em %LEXOFFICE_PKCS11_DLL%& pause & exit /b 1)
echo Modo de certificado: %LEXOFFICE_KEYSTORE_TYPE%
echo A chave privada permanece no token. O PIN sera solicitado somente nesta maquina.
java -jar "%JAR%"
pause
