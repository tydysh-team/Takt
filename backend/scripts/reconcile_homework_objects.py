"""Bounded, opt-in cleanup of old homework objects absent from PostgreSQL.

Run inside the Backend container. Default mode only reports candidates.
"""

import argparse
import asyncio
import re
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.models.homework import HomeworkAttachment
from app.storage.s3 import S3Storage

HOMEWORK_KEY = re.compile(
    r"(?:assignments|submissions)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)


async def reconcile(delete: bool) -> None:
    settings = get_settings()
    storage = S3Storage(settings)
    assignment_objects, assignment_truncated = await storage.list_objects(
        "assignments/", max_keys=1000
    )
    submission_objects, submission_truncated = await storage.list_objects(
        "submissions/", max_keys=1000
    )
    objects = assignment_objects + submission_objects
    truncated = assignment_truncated or submission_truncated
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    candidates = [
        key for key, modified in objects if HOMEWORK_KEY.fullmatch(key) and modified < cutoff
    ]
    if not candidates:
        print("No old homework objects in the scanned pages")
        return
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as connection:
            rows = await connection.scalars(
                select(HomeworkAttachment.storage_key).where(
                    HomeworkAttachment.storage_key.in_(candidates)
                )
            )
            referenced = set(rows)
    finally:
        await engine.dispose()
    orphans = [key for key in candidates if key not in referenced]
    for key in orphans[:100]:
        if delete:
            await storage.delete_object(key)
        print(f"{'deleted' if delete else 'candidate'} {key}")
    print(
        f"Scanned {len(objects)} objects; {len(orphans)} candidates; "
        f"{'deleted' if delete else 'reported'} {min(len(orphans), 100)}."
    )
    if truncated or len(orphans) > 100:
        print("More objects remain; review additional pages before assuming cleanup is complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--delete", action="store_true", help="delete confirmed old orphans")
    args = parser.parse_args()
    asyncio.run(reconcile(args.delete))
