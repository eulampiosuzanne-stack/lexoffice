@echo off
set "PKCS11_DRIVER=C:\Windows\System32\aetpkss1.dll"
set "LEXOFFICE_ORIGIN=https://lexoffice-ashy.vercel.app"
java -jar lexoffice-icpbr-bridge.jar
pause
