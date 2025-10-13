# Offline assets for Insight Sphere

This directory contains scripts and cached artefacts that allow the project to
be built without reaching out to the public internet.  The workflow is:

1. Run the helper script while you still have network access.
2. Copy the populated `deploy/offline` directory and the saved Docker images to
   the air-gapped environment.
3. Load the container images and run `docker compose up`.

## Preparing the cache

Execute the helper script from the repository root:

```bash
./deploy/offline/fetch_assets.sh
```

The script performs the following tasks:

- Downloads every Python wheel declared in `backend/app/requirements.txt` into
  `deploy/offline/python` using `pip download`.
- Installs the frontend dependencies with `npm ci` while seeding
  `deploy/offline/npm/frontend` so that a later `npm ci --offline` can be
  executed in a container.  The same happens for `backend/package.json` when
  present, populating `deploy/offline/npm/backend`.
- Pulls all container images listed in `deploy/offline/docker-images.txt` and
  saves them as tar archives under `deploy/offline/images`.

> **Note**
> The script is idempotent.  Re-running it refreshes the cache so you can pick
> up updated dependencies when desired.
> Cached `node_modules` directories are removed after the script finishes so the
> repository tree stays clean.  Only the content-addressable npm cache is kept.

## Using the offline assets

Once the cache is populated you can transfer the repository to the offline
machine and load the container images:

```bash
for image in deploy/offline/images/*.tar; do
  docker load --input "$image"
done
```

Afterwards the standard `docker compose up --build` command will build both the
backend and the frontend exclusively from the local artefacts.

## Overriding registries and endpoints

The helper script and Dockerfiles honour a set of environment variables that let
you route dependency downloads through internal mirrors:

- `PIP_INDEX_URL` and `PIP_EXTRA_INDEX_URL` are forwarded to `pip download`.
- `NPM_REGISTRY_URL` points `npm` to a Verdaccio or compatible registry.
- `CONTAINER_REGISTRY_MIRROR` is prefixed to every image in
  `deploy/offline/docker-images.txt` when the script pulls base images.

At runtime the Dockerfiles can be instructed to talk to the same mirrors by
passing build arguments:

```bash
docker compose build \
  --build-arg PIP_WHEEL_DIR=deploy/offline/python \
  --build-arg NPM_CACHE_DIR=deploy/offline/npm/frontend \
  --build-arg NPM_REGISTRY_URL=http://verdaccio:4873/
```

The Compose files automatically supply these defaults, so you usually only need
custom arguments when the offline cache lives in a different location.

### Local ClamAV and object storage

The backend exposes environment variables that make it easy to point the
application at internal services:

- Set `CLAMAV_SCAN_URL=http://clamav:3310/scan` to use a ClamAV instance started
  on the same Docker network.
- Set `AWS_ENDPOINT_URL=http://minio:9000` (or the corresponding
  `S3_ENDPOINT_URL`) if you host object storage on MinIO.

The new documentation in `docs/offline.md` describes how to spin up helper
services (Verdaccio, ClamAV, MinIO) alongside the main stack.
