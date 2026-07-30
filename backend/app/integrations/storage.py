from collections.abc import Callable
from datetime import datetime, timedelta
from pathlib import Path
from typing import Protocol

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import AppConfig
from app.core.ids import utc_now
from app.core.readiness import require_b2


class ObjectStorage(Protocol):
    bucket: str

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> None: ...

    def upload_file(self, key: str, path: Path, content_type: str) -> None: ...

    def download_file(self, key: str, destination: Path) -> None: ...

    def delete_object(self, key: str) -> None: ...

    def exists(self, key: str) -> bool: ...

    def signed_url(
        self,
        key: str,
        *,
        download: bool = False,
    ) -> tuple[str, datetime]: ...


class B2Storage:
    def __init__(
        self,
        config: AppConfig,
        *,
        client_factory: Callable[..., BaseClient] | None = None,
    ) -> None:
        require_b2(config)
        self.bucket = config.b2_bucket or ""
        self._ttl = config.signed_url_ttl_seconds
        factory = client_factory or boto3.client
        self._client = factory(
            "s3",
            endpoint_url=config.b2_endpoint,
            region_name=config.b2_region,
            aws_access_key_id=(
                config.b2_key_id.get_secret_value() if config.b2_key_id else None
            ),
            aws_secret_access_key=(
                config.b2_application_key.get_secret_value()
                if config.b2_application_key
                else None
            ),
            config=Config(signature_version="s3v4"),
        )

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    def upload_file(self, key: str, path: Path, content_type: str) -> None:
        self._client.upload_file(
            str(path),
            self.bucket,
            key,
            ExtraArgs={"ContentType": content_type},
        )

    def download_file(self, key: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        self._client.download_file(self.bucket, key, str(destination))

    def delete_object(self, key: str) -> None:
        self._client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as error:
            status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status in {403, 404}:
                return False
            raise

    def signed_url(
        self,
        key: str,
        *,
        download: bool = False,
    ) -> tuple[str, datetime]:
        params: dict[str, str] = {"Bucket": self.bucket, "Key": key}
        if download:
            filename = key.rsplit("/", maxsplit=1)[-1]
            params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
        url = self._client.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=self._ttl,
        )
        return url, utc_now() + timedelta(seconds=self._ttl)
