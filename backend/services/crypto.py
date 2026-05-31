"""Fernet-based encryption for user tokens stored in SQLite."""

from cryptography.fernet import Fernet
from config import settings
from logger import get_logger

log = get_logger("devpulse.crypto")

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(settings.ENCRYPTION_KEY.encode())
    return _fernet


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string and return base64 ciphertext."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt a Fernet ciphertext back to plaintext."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()
