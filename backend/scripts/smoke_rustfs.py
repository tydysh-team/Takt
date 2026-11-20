"""Non-destructive RustFS smoke test using a dedicated temporary bucket.

Run prepare, recreate only the RustFS container, then run verify and cleanup.
"""

import argparse
import hashlib
import json
import os
import tempfile
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen
from uuid import uuid4

import boto3
from botocore.config import Config
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
STATE = Path(tempfile.gettempdir()) / "takt-rustfs-smoke.json"


def client_and_endpoint():
    values = dotenv_values(ROOT / ".env")
    endpoint = os.environ.get("S3_ENDPOINT_URL", "http://127.0.0.1:9000")
    access = os.environ.get("S3_ACCESS_KEY") or values.get("RUSTFS_ACCESS_KEY")
    secret = os.environ.get("S3_SECRET_KEY") or values.get("RUSTFS_SECRET_KEY")
    if not access or not secret:
        raise RuntimeError("Set RustFS credentials in the root .env")
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name="us-east-1",
        aws_access_key_id=access,
        aws_secret_access_key=secret,
        config=Config(s3={"addressing_style": "path"}),
    )
    return client, endpoint


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=("prepare", "verify", "cleanup"))
    phase = parser.parse_args().phase
    client, endpoint = client_and_endpoint()
    if phase == "prepare":
        bucket = f"takt-homework-smoke-{uuid4().hex[:12]}"
        key = f"probe/{uuid4()}"
        content = os.urandom(9 * 1024 * 1024)
        expected = hashlib.sha256(content).hexdigest()
        client.create_bucket(Bucket=bucket)
        client.upload_fileobj(BytesIO(content), bucket, key)
        actual = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        if hashlib.sha256(actual).hexdigest() != expected:
            raise AssertionError("S3 upload/download checksum mismatch")
        try:
            urlopen(f"{endpoint}/{bucket}/{key}", timeout=10)
        except HTTPError as exc:
            if exc.code != 403:
                raise AssertionError(f"Anonymous access returned {exc.code}, expected 403") from exc
        else:
            raise AssertionError("Anonymous object access unexpectedly succeeded")
        STATE.write_text(
            json.dumps({"bucket": bucket, "key": key, "sha256": expected}), encoding="utf-8"
        )
        print(f"prepared {bucket}; SHA-256 and anonymous denial verified")
        return
    state = json.loads(STATE.read_text(encoding="utf-8"))
    bucket, key = state["bucket"], state["key"]
    if phase == "verify":
        actual = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        if hashlib.sha256(actual).hexdigest() != state["sha256"]:
            raise AssertionError("Object changed after container recreation")
        print("object persisted after RustFS container recreation")
        return
    client.delete_object(Bucket=bucket, Key=key)
    client.delete_bucket(Bucket=bucket)
    STATE.unlink()
    print("temporary smoke bucket removed")


if __name__ == "__main__":
    main()
