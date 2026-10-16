import hashlib
import hmac
import secrets
from dataclasses import dataclass

from app.core.config import Settings

INVITATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
INVITATION_CODE_LENGTH = 10


@dataclass(frozen=True, slots=True)
class InvitationCode:
    raw: str
    digest: str


class InvitationCodeService:
    def __init__(self, settings: Settings) -> None:
        self._key = settings.invitation_code_secret.get_secret_value().encode()

    def generate(self) -> InvitationCode:
        canonical = "".join(
            secrets.choice(INVITATION_ALPHABET) for _ in range(INVITATION_CODE_LENGTH)
        )
        raw = f"{canonical[:4]}-{canonical[4:8]}-{canonical[8:]}"
        return InvitationCode(raw=raw, digest=self._digest_canonical(canonical))

    def digest(self, raw_code: str) -> str:
        canonical = self.normalize(raw_code)
        return self._digest_canonical(canonical)

    @staticmethod
    def normalize(raw_code: str) -> str:
        canonical = "".join(
            character
            for character in raw_code.strip().upper()
            if character != "-" and not character.isspace()
        )
        if (
            len(canonical) != INVITATION_CODE_LENGTH
            or any(character not in INVITATION_ALPHABET for character in canonical)
        ):
            raise ValueError("Invalid invitation code format")
        return canonical

    def _digest_canonical(self, canonical: str) -> str:
        return hmac.new(self._key, canonical.encode(), hashlib.sha256).hexdigest()
