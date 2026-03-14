from fastapi import FastAPI

app = FastAPI(title="White Christmas API (Deprecated Entrypoint)")


@app.get("/")
def root():
    return {
        "status": "deprecated",
        "message": "Use backend/main.py FastAPI app instead (uvicorn main:app --reload --port 8000).",
    }


@app.get("/health")
def health():
    return {"status": "deprecated"}
