
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
# Avoid uvloop-related segmentation faults by forcing the asyncio loop
python run_server.py
```

If you still prefer the `uvicorn` CLI, add `--loop asyncio` to the command to
disable uvloop:

```bash
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --loop asyncio
```

## Building the frontend

```bash
cd frontend
npm run build
```
