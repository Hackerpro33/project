
## Running the frontend

```bash
cd frontend
npm install
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
cd frontend
npm run build
```
