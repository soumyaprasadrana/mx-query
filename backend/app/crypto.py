"""API-key encryption at rest.

AES-256-GCM with a 32-byte key derived (SHA-256) from `MQB_SESSION_ENCRYPTION_KEY`.
A tenant's Maximo API key is never stored in plain text and never logged.
Adapted verbatim from `maximo-playbook-platform/src/playbook/services/crypto.py`
(PBD-010 decision b) — see docs/ARCHITECTURE.md.

If the setting is blank we derive a machine-local key so single-user dev keeps
working without configuration; any shared/production deployment must set an
explicit `MQB_SESSION_ENCRYPTION_KEY`.
"""
from __future__ import annotations

import base64
import hashlib
import os
import socket

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import get_settings


class CryptoError(Exception):
    """Malformed or undecryptable secret blob."""


def _key() -> bytes:
    """32-byte AES key: SHA-256 of the configured secret (or a machine-local one)."""
    secret = get_settings().session_encryption_key or f"maximo-local:{socket.gethostname()}"
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_secret(plain: str) -> str:
    """Encrypt a UTF-8 string to a compact `nonce.ciphertext` base64 blob.

    The 16-byte GCM auth tag is appended to the ciphertext by AESGCM.
    """
    nonce = os.urandom(12)
    ct = AESGCM(_key()).encrypt(nonce, plain.encode("utf-8"), None)
    return f"{base64.b64encode(nonce).decode()}.{base64.b64encode(ct).decode()}"


def decrypt_secret(blob: str) -> str:
    """Decrypt a blob produced by `encrypt_secret`. Raises CryptoError if malformed."""
    parts = blob.split(".")
    if len(parts) != 2:
        raise CryptoError("Malformed encrypted secret")
    try:
        nonce = base64.b64decode(parts[0])
        ct = base64.b64decode(parts[1])
        return AESGCM(_key()).decrypt(nonce, ct, None).decode("utf-8")
    except Exception as exc:  # invalid tag, wrong key, bad base64
        raise CryptoError("Could not decrypt secret") from exc
