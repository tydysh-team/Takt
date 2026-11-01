from datetime import UTC, datetime, timedelta, timezone
from uuid import uuid4

import pyotp

from app.models.mfa import UserTotp
from app.services.mfa import MfaService


def test_totp_accepts_small_clock_drift_but_rejects_replay() -> None:
    secret = pyotp.random_base32()
    instant = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)
    state = UserTotp(user_id=uuid4())
    state.last_used_step = None
    previous = pyotp.TOTP(secret).at(instant - timedelta(seconds=30))
    current = pyotp.TOTP(secret).at(instant)
    assert MfaService._verify_totp(secret, previous, state, instant)
    assert not MfaService._verify_totp(secret, previous, state, instant)
    assert MfaService._verify_totp(secret, current, state, instant)
    assert not MfaService._verify_totp(secret, previous, state, instant)


def test_totp_validation_is_timezone_independent() -> None:
    secret = pyotp.random_base32()
    utc_time = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)
    minsk_time = utc_time.astimezone(timezone(timedelta(hours=3)))
    code = pyotp.TOTP(secret).at(utc_time)
    utc_state = UserTotp(user_id=uuid4())
    minsk_state = UserTotp(user_id=uuid4())
    utc_state.last_used_step = None
    minsk_state.last_used_step = None
    assert MfaService._verify_totp(secret, code, utc_state, utc_time)
    assert MfaService._verify_totp(secret, code, minsk_state, minsk_time)
    assert utc_state.last_used_step == minsk_state.last_used_step


def test_totp_rejects_non_ascii_and_short_codes() -> None:
    state = UserTotp(user_id=uuid4())
    state.last_used_step = None
    instant = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)
    secret = pyotp.random_base32()
    assert not MfaService._verify_totp(secret, "١٢٣٤٥٦", state, instant)
    assert not MfaService._verify_totp(secret, "12345", state, instant)
