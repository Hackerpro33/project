FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY app/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY scripts ./scripts

ENV PYTHONPATH=/app

RUN useradd --create-home appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["/app/scripts/start.sh"]
# syntax=docker/dockerfile:1.6

ARG PYTHON_VERSION=3.11

FROM python:${PYTHON_VERSION}-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install --no-install-recommends -y build-essential curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/app/requirements.txt ./requirements.txt

RUN pip install --upgrade pip \
    && pip install --prefix=/install --no-warn-script-location -r requirements.txt

COPY backend/app /app

FROM gcr.io/distroless/python3-debian12:latest AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY --from=builder /install /usr/local
COPY --chown=65532:65532 backend/app /app

USER 65532

EXPOSE 8000

ENTRYPOINT ["python", "-m", "uvicorn", "app.main:app"]
CMD ["--host", "0.0.0.0", "--port", "8000"]
