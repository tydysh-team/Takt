"""Async facade around the blocking boto3 S3 client."""

import asyncio
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any, BinaryIO

import boto3  # type: ignore[import-untyped]
from botocore.config import Config  # type: ignore[import-untyped]
from botocore.exceptions import ClientError  # type: ignore[import-untyped]

from app.core.config import Settings


class S3Storage:
    def __init__(self, settings: Settings) -> None:
        if settings.s3_access_key is None or settings.s3_secret_key is None:
            raise RuntimeError("S3 credentials are required for homework attachments")
        self.bucket = settings.s3_bucket
        self._client: Any = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key.get_secret_value(),
            aws_secret_access_key=settings.s3_secret_key.get_secret_value(),
            config=Config(s3={"addressing_style": "path"}, retries={"max_attempts": 2}),
        )

    async def ensure_bucket(self) -> None:
        def ensure() -> None:
            try:
                self._client.head_bucket(Bucket=self.bucket)
            except ClientError as exc:
                code = str(exc.response.get("Error", {}).get("Code", ""))
                if code not in {"404", "NoSuchBucket"}:
                    raise
                try:
                    self._client.create_bucket(Bucket=self.bucket)
                except ClientError as create_error:
                    if (
                        create_error.response.get("Error", {}).get("Code")
                        != "BucketAlreadyOwnedByYou"
                    ):
                        raise

        await asyncio.to_thread(ensure)

    async def upload_object(self, key: str, source: BinaryIO, mime_type: str) -> None:
        await asyncio.to_thread(
            self._client.upload_fileobj,
            source,
            self.bucket,
            key,
            ExtraArgs={"ContentType": mime_type},
        )

    async def download_object(self, key: str) -> AsyncIterator[bytes]:
        response = await asyncio.to_thread(self._client.get_object, Bucket=self.bucket, Key=key)
        body = response["Body"]

        async def chunks() -> AsyncIterator[bytes]:
            try:
                while chunk := await asyncio.to_thread(body.read, 64 * 1024):
                    yield chunk
            finally:
                await asyncio.to_thread(body.close)

        return chunks()

    async def delete_object(self, key: str) -> None:
        await asyncio.to_thread(self._client.delete_object, Bucket=self.bucket, Key=key)

    async def object_exists(self, key: str) -> bool:
        try:
            await asyncio.to_thread(self._client.head_object, Bucket=self.bucket, Key=key)
            return True
        except ClientError as exc:
            if str(exc.response.get("Error", {}).get("Code", "")) in {"404", "NoSuchKey"}:
                return False
            raise

    async def list_objects(
        self, prefix: str, max_keys: int = 1000
    ) -> tuple[list[tuple[str, datetime]], bool]:
        response = await asyncio.to_thread(
            self._client.list_objects_v2,
            Bucket=self.bucket,
            Prefix=prefix,
            MaxKeys=max_keys,
        )
        objects = [(item["Key"], item["LastModified"]) for item in response.get("Contents", [])]
        return objects, bool(response.get("IsTruncated"))
