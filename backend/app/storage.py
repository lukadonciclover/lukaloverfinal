from __future__ import annotations

from typing import Any, Protocol


class DurableWorkspaceStorage(Protocol):
    """Optional persistence boundary for a future database/object-store provider."""

    def load_workspace(self, workspace_id: str) -> dict[str, Any] | None: ...

    def save_workspace(self, workspace_id: str, payload: dict[str, Any]) -> None: ...

    def save_document(self, workspace_id: str, name: str, content: bytes) -> str: ...

    def delete_document(self, object_key: str) -> None: ...


class PersistenceNotConfigured(RuntimeError):
    pass


def get_durable_storage() -> DurableWorkspaceStorage:
    """The stateless demo deliberately has no implicit server-side persistence."""
    raise PersistenceNotConfigured(
        "Durable storage is not configured. Use browser workspace export/import or install a provider implementation."
    )
