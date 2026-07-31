import pytest

from app.auth.passwords import hash_password, verify_password


def test_argon2_password_round_trip() -> None:
    encoded = hash_password("eight-or-more")
    assert encoded.startswith("$argon2")
    assert encoded != "eight-or-more"
    assert verify_password("eight-or-more", encoded)
    assert not verify_password("incorrect", encoded)


@pytest.mark.parametrize("password", ["", "short"])
def test_password_hash_rejects_short_values(password: str) -> None:
    with pytest.raises(ValueError):
        hash_password(password)
