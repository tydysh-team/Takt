import pytest
from pydantic import ValidationError

from app.schemas.auth import RegisterRequest


def registration(password: str) -> RegisterRequest:
    return RegisterRequest.model_validate(
        {
            "email": "unit@example.com",
            "password": password,
            "first_name": "Ada",
            "last_name": "Lovelace",
            "role": "TEACHER",
        }
    )


@pytest.mark.parametrize(
    ("password", "valid"),
    [
        pytest.param("1234567", False, id="seven-characters"),
        pytest.param("abcdefgh", True, id="eight-characters"),
        pytest.param("a" * 128, True, id="one-hundred-twenty-eight-characters"),
        pytest.param("a" * 129, False, id="one-hundred-twenty-nine-characters"),
        pytest.param("onlyletterspassword", True, id="letters-only"),
        pytest.param("12345678", True, id="digits-only"),
        pytest.param("NoSpecial123", True, id="without-special-character"),
    ],
)
def test_registration_password_policy_is_length_only(password: str, valid: bool) -> None:
    if valid:
        assert registration(password).password.get_secret_value() == password
        return

    with pytest.raises(ValidationError):
        registration(password)


def test_registration_does_not_accept_timezone() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest.model_validate(
            {
                "email": "unit@example.com",
                "password": "12345678",
                "first_name": "Ada",
                "last_name": "Lovelace",
                "role": "STUDENT",
                "timezone": "Europe/Samara",
            }
        )
