"""
Compatibility entrypoint.

This keeps `uvicorn server:app` working while the canonical implementation
lives in `main.py`.
"""

from main import app
