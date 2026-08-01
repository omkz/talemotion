import ast
from pathlib import Path

APP_ROOT = Path(__file__).parents[1] / "app"
GENBLAZE_BOUNDARY = APP_ROOT / "providers" / "media" / "genblaze.py"


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def test_genblaze_imports_are_confined_to_media_boundary() -> None:
    offenders = [
        str(path.relative_to(APP_ROOT))
        for path in APP_ROOT.rglob("*.py")
        if path != GENBLAZE_BOUNDARY
        and any(name.startswith("genblaze_") for name in _imports(path))
    ]
    assert offenders == []


def test_application_does_not_import_boto_clients_directly() -> None:
    offenders = [
        str(path.relative_to(APP_ROOT))
        for path in APP_ROOT.rglob("*.py")
        if any(
            name == "boto3"
            or name.startswith("boto3.")
            or name == "botocore"
            or name.startswith("botocore.")
            for name in _imports(path)
        )
    ]
    assert offenders == []


def test_genblaze_boundary_contains_media_but_not_storyboard_llm() -> None:
    source = GENBLAZE_BOUNDARY.read_text(encoding="utf-8")
    assert "class GenblazeSceneGenerator" in source
    assert "class GenblazeRenderMediaGateway" in source
    assert "GenblazeStoryboardGenerator" not in source
    assert "pydantic_ai" not in source
