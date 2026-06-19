#!/usr/bin/env sh
set -eu

python -m scripts.init_db
exec gunicorn "app:create_app()" -c gunicorn.conf.py
