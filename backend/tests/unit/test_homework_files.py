from io import BytesIO

import pytest
from fastapi import UploadFile

from app.services.homework import HomeworkFailure, inspect_file


@pytest.mark.asyncio
async def test_txt_file_is_streamed_and_hashed() -> None:
    upload = UploadFile(filename="условия.txt", file=BytesIO("Задача 1".encode()))
    name, mime, size, digest = await inspect_file(upload)
    assert name == "условия.txt"
    assert mime == "text/plain"
    assert size == len("Задача 1".encode())
    assert len(digest) == 64
    assert await upload.read() == "Задача 1".encode()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("name", "content", "code"),
    [
        ("run.exe", b"MZ", "invalid_attachment"),
        ("fake.pdf", b"not a pdf", "invalid_attachment"),
        ("bad.txt", b"\xff\xfe", "invalid_attachment"),
        ("too-large.txt", b"a" * (10 * 1024 * 1024 + 1), "attachment_too_large"),
    ],
    ids=["executable", "fake-pdf", "invalid-utf8", "too-large"],
)
async def test_rejects_invalid_and_oversized_files(name: str, content: bytes, code: str) -> None:
    upload = UploadFile(filename=name, file=BytesIO(content))
    with pytest.raises(HomeworkFailure) as failure:
        await inspect_file(upload)
    assert failure.value.code == code
