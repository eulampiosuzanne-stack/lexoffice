@echo off
setlocal
chcp 65001 >nul
title LEXOFFICE - Assinatura ICP-Brasil
cd /d "%~dp0"

echo ==============================================
echo   LEXOFFICE - ASSINATURA ICP-BRASIL A3
echo ==============================================
echo.
echo 1. Conecte o token Certisign A3 no computador.
echo 2. Nao informe seu PIN no navegador ou no LEXOFFICE.
echo.

where java >nul 2>nul
if errorlevel 1 (
  echo ERRO: Java nao foi encontrado neste computador.
  echo Instale/ative o Java e execute este arquivo novamente.
  pause
  exit /b 1
)

if not exist "C:\Windows\System32\aetpkss1.dll" (
  echo ERRO: O SafeSign do token nao foi localizado.
  echo Caminho esperado: C:\Windows\System32\aetpkss1.dll
  pause
  exit /b 1
)

if not exist "lexoffice-icp-bridge.jar" (
  echo ERRO: O componente lexoffice-icp-bridge.jar ainda nao esta nesta pasta.
  echo O instalador final deve trazer esse arquivo automaticamente.
  pause
  exit /b 1
)

echo Token/SafeSign localizado.
echo Iniciando ponte local segura em 127.0.0.1:17681...
echo.
java -Dlexoffice.pkcs11="C:\Windows\System32\aetpkss1.dll" -Dlexoffice.host="127.0.0.1" -Dlexoffice.port="17681" -jar "lexoffice-icp-bridge.jar"

if errorlevel 1 (
  echo.
  echo A ponte foi encerrada com erro.
  pause
)
endlocal
