#!/bin/sh
# Cria o bucket de anexos como PRIVADO (sem acesso anônimo). O acesso a fotos é sempre
# mediado pela API autorizada (URLs pré-assinadas de curta duração ou streaming pela API).
set -eu

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing "local/$S3_BUCKET"
mc anonymous set none "local/$S3_BUCKET"
echo "Bucket privado '$S3_BUCKET' pronto."
