#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/lexoffice-documenso}
PUBLIC_URL=${PUBLIC_URL:-}
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM=${SMTP_FROM:-}
SMTP_FROM_NAME=${SMTP_FROM_NAME:-LEXOFFICE Assinaturas}

if [ -z "$PUBLIC_URL" ]; then echo "ERRO: defina PUBLIC_URL (ex.: https://assinaturas.seudominio.com.br)"; exit 1; fi
if [ -z "$SMTP_HOST" ] || [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASS" ] || [ -z "$SMTP_FROM" ]; then echo "ERRO: defina SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM"; exit 1; fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"

if ! command -v docker >/dev/null 2>&1; then echo "ERRO: Docker não encontrado."; exit 1; fi
if ! docker compose version >/dev/null 2>&1; then echo "ERRO: Docker Compose v2 não encontrado."; exit 1; fi
if ! command -v openssl >/dev/null 2>&1; then echo "ERRO: OpenSSL não encontrado."; exit 1; fi

curl -fsSLo compose.yml https://raw.githubusercontent.com/documenso/documenso/release/docker/production/compose.yml

DB_PASS=$(openssl rand -hex 24)
NEXTAUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')
ENC1=$(openssl rand -base64 32 | tr -d '\n')
ENC2=$(openssl rand -base64 32 | tr -d '\n')
CERT_PASS=$(openssl rand -hex 24)

mkdir -p certs
openssl req -x509 -newkey rsa:3072 -keyout certs/private.key -out certs/certificate.crt -sha256 -days 3650 -nodes -subj "/C=BR/O=LEXOFFICE/OU=Assinaturas/CN=LEXOFFICE Documenso"
openssl pkcs12 -export -out certs/cert.p12 -inkey certs/private.key -in certs/certificate.crt -passout pass:"$CERT_PASS" -legacy
chown 1001:1001 certs/cert.p12 || true
chmod 400 certs/cert.p12

cat > .env <<EOF
POSTGRES_USER=documenso
POSTGRES_PASSWORD=$DB_PASS
POSTGRES_DB=documenso
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
NEXT_PRIVATE_ENCRYPTION_KEY=$ENC1
NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY=$ENC2
NEXT_PUBLIC_WEBAPP_URL=$PUBLIC_URL
NEXT_PRIVATE_INTERNAL_WEBAPP_URL=http://documenso:3000
NEXT_PRIVATE_DATABASE_URL=postgresql://documenso:$DB_PASS@database:5432/documenso
NEXT_PRIVATE_DIRECT_DATABASE_URL=postgresql://documenso:$DB_PASS@database:5432/documenso
NEXT_PRIVATE_SIGNING_TRANSPORT=local
NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH=/opt/documenso/cert.p12
NEXT_PRIVATE_SIGNING_PASSPHRASE=$CERT_PASS
NEXT_PRIVATE_SMTP_TRANSPORT=smtp-auth
NEXT_PRIVATE_SMTP_HOST=$SMTP_HOST
NEXT_PRIVATE_SMTP_PORT=$SMTP_PORT
NEXT_PRIVATE_SMTP_USERNAME=$SMTP_USER
NEXT_PRIVATE_SMTP_PASSWORD=$SMTP_PASS
NEXT_PRIVATE_SMTP_FROM_NAME=$SMTP_FROM_NAME
NEXT_PRIVATE_SMTP_FROM_ADDRESS=$SMTP_FROM
NEXT_PRIVATE_SMTP_SECURE=false
NEXT_PUBLIC_UPLOAD_TRANSPORT=database
# Deixe o primeiro cadastro habilitado. Depois de criar a conta administradora,
# altere para true e reinicie o container.
NEXT_PUBLIC_DISABLE_SIGNUP=false
EOF
chmod 600 .env

cat > compose.override.yml <<EOF
services:
  documenso:
    volumes:
      - ./certs/cert.p12:/opt/documenso/cert.p12:ro
    restart: unless-stopped
  database:
    restart: unless-stopped
EOF

docker compose -f compose.yml -f compose.override.yml pull
docker compose -f compose.yml -f compose.override.yml up -d

echo "Aguardando Documenso..."
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/certificate-status >/dev/null 2>&1; then
    echo "DOCUMENSO_OK"
    echo "URL=$PUBLIC_URL"
    exit 0
  fi
  sleep 4
done

echo "Documenso iniciou, mas o health/certificate-status ainda não respondeu. Verifique: docker compose -f compose.yml -f compose.override.yml logs --tail=100 documenso"
exit 2
