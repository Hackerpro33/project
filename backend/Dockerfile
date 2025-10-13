# syntax=docker/dockerfile:1.6

ARG PYTHON_VERSION=3.11

FROM python:${PYTHON_VERSION}-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/app/requirements.txt ./requirements.txt

ARG PIP_WHEEL_DIR=deploy/offline/python
COPY ${PIP_WHEEL_DIR}/ /tmp/wheels/

RUN --mount=type=cache,target=/root/.cache/pip \
    if find /tmp/wheels -maxdepth 1 -type f -name '*.whl' -print -quit >/dev/null; then \
        pip install --prefix=/install --no-warn-script-location --no-index --find-links=/tmp/wheels -r requirements.txt; \
    else \
        pip install --prefix=/install --no-warn-script-location -r requirements.txt; \
    fi

COPY backend/app /app
COPY backend/alembic /alembic
COPY backend/alembic.ini /alembic.ini
COPY backend/scripts /scripts

FROM python:${PYTHON_VERSION}-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY --from=builder /install /usr/local
COPY --from=builder /app /app
COPY --from=builder /alembic /alembic
COPY --from=builder /alembic.ini /alembic.ini
COPY --from=builder /scripts /scripts

RUN useradd --create-home --uid 1000 appuser && \
    chown -R appuser:appuser /app /alembic /alembic.ini /scripts && \
    chmod +x /scripts/start.sh

USER appuser

EXPOSE 8000

ENTRYPOINT ["/scripts/start.sh"]
