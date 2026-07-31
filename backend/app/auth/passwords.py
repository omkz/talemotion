from pwdlib import PasswordHash
from pwdlib.exceptions import PwdlibError
from pwdlib.hashers.argon2 import Argon2Hasher

password_hash = PasswordHash((Argon2Hasher(),))


def hash_password(password: str) -> str:
    if not password or len(password) < 8:
        raise ValueError("Password must contain at least 8 characters.")
    return password_hash.hash(password)


def verify_password(password: str, encoded_hash: str) -> bool:
    if not password or not encoded_hash:
        return False
    try:
        return password_hash.verify(password, encoded_hash)
    except (PwdlibError, ValueError):
        return False
