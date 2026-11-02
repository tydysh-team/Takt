from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.responses import FileResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


class SpaStaticFiles(StaticFiles):
    """Serve built assets and fall back to React for application routes."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
        first_segment = scope["path"].lstrip("/").split("/", 1)[0]
        if first_segment in {"api", "admin", "health"} or "." in path:
            raise HTTPException(status_code=404)
        if scope["method"] not in {"GET", "HEAD"}:
            raise HTTPException(status_code=404)
        assert self.directory is not None
        return FileResponse(Path(self.directory) / "index.html")
