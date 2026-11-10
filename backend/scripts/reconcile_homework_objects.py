"""Bounded, opt-in cleanup of old assignment objects absent from PostgreSQL.

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

ASSIGNMENT_KEY = re.compile(
    r"assignments/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)


async def reconcile(delete: bool) -> None:
    settings = get_settings()
    storage = S3Storage(settings)
    objects, truncated = await storage.list_objects("assignments/", max_keys=1000)
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    candidates = [
        key for key, modified in objects if ASSIGNMENT_KEY.fullmatch(key) and modified < cutoff
    ]
    if not candidates:
        print("No old assignment objects in the scanned page")
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
