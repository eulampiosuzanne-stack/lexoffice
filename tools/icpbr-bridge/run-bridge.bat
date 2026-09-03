@echo off
if "%LEXOFFICE_KEYSTORE_TYPE%"=="" set "LEXOFFICE_KEYSTORE_TYPE=WINDOWS-MY"
set "LEXOFFICE_PKCS11_DLL=C:\Windows\System32\aetpkss1.dll"
set "LEXOFFICE_ORIGIN=https://lexoffice-ashy.vercel.app"
echo Modo de certificado: %LEXOFFICE_KEYSTORE_TYPE%
java -jar lexoffice-icpbr-bridge.jar
pause
