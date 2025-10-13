# Offline and air-gapped deployments

This guide explains how to prepare Insight Sphere for an environment without
internet access.  The workflow combines locally cached dependencies and optional
helper services.

## 1. Prime the offline cache

Run the helper script while you still have network access:

```bash
./deploy/offline/fetch_assets.sh
```

The script downloads Python wheels, warms the npm caches used by the backend and
frontend, and stores all required container images (listed in
`deploy/offline/docker-images.txt`) under `deploy/offline/images/`.

You can customise the mirrors used during this process:

- `PIP_INDEX_URL` / `PIP_EXTRA_INDEX_URL` – point to an internal PyPI mirror.
- `NPM_REGISTRY_URL` – point to Verdaccio or a private npm registry.
- `CONTAINER_REGISTRY_MIRROR` – prepend a registry hostname when pulling base
  images.

After the script completes, copy the repository (including the newly populated
`deploy/offline` directory) and the image archives to the offline machine.

## 2. Load container images

On the air-gapped host load the previously saved images:

```bash
for image in deploy/offline/images/*.tar; do
  docker load --input "$image"
done
```

This step ensures that `docker compose` never needs to reach Docker Hub.

## 3. Start the application stack

The default `docker-compose.yml` already references the offline artefacts.  You
only need to force a rebuild to consume the cached dependencies:

```bash
docker compose up --build
```

The backend image installs dependencies from `deploy/offline/python` when the
wheelhouse is present, and the frontend uses the offline npm cache stored in
`deploy/offline/npm/frontend`.

## 4. Optional helper services

Use `docker-compose.tools.yml` to launch services that mimic external
infrastructure:

```bash
docker compose -f docker-compose.yml -f docker-compose.tools.yml up --build
```

The file currently provisions:

- **ClamAV** – exposed on `clamav:3310` to satisfy `CLAMAV_SCAN_URL`.
- **Verdaccio** – private npm registry available at `http://verdaccio:4873`.
- **MinIO** – S3 compatible object storage at `http://minio:9000` with the
  console running on `http://localhost:9001`.

Point the application to those services via environment variables.  For example,
place the following settings inside an `.env.offline` file and pass it to
`docker compose` using `--env-file`:

```env
CLAMAV_SCAN_URL=http://clamav:3310/scan
NPM_REGISTRY_URL=http://verdaccio:4873/
AWS_ENDPOINT_URL=http://minio:9000
AWS_ACCESS_KEY_ID=minio
AWS_SECRET_ACCESS_KEY=minio-secret
```

The backend automatically picks up the ClamAV and object storage URLs, and the
frontend build process is instructed to talk to Verdaccio through the build
argument supplied in `docker-compose.yml`.

## 5. Keeping the cache fresh

Whenever dependencies change rerun `deploy/offline/fetch_assets.sh`.  The script
updates the wheelhouse, npm caches, and image archives so that the offline
environment mirrors the state of the upstream repository.
