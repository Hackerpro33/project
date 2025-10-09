
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

## Building the frontend

```bash
cd frontend
npm run build
```
