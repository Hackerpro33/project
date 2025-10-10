
## Running the frontend

Some dev-container configurations fail to resolve the `frontend/` folder when
running shell tasks (for example `npm install`) from the repository root. The
helper script below resolves the folder using an absolute path before executing
`npm`, which avoids the "no filesystem provider for folder frontend" error.

```bash
# install dependencies without leaving the repo root
./scripts/install_frontend_deps.sh

# start the Vite dev server
cd frontend
npm run dev
```

## Running the backend

```bash
cd backend
pip install -r app/requirements.txt
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

## Verifying functionality

After both services are running you can exercise the full feature set through the automated test suites:

```bash
# Backend API checks
pytest backend/app/tests/test_data_transformation.py

# Frontend unit and integration checks
cd frontend
npm test
```

The backend tests cover file uploads, dataset and visualisation CRUD flows, analytics generation and email logging, while the Vitest suite validates the frontend data utilities and API helpers.

## Building the frontend

```bash
# ensure dependencies are present (safe to re-run)
./scripts/install_frontend_deps.sh

cd frontend
npm run build
```
