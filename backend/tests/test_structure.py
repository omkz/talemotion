import ast
from pathlib import Path

APP_ROOT = Path(__file__).parents[1] / "app"
GENBLAZE_BOUNDARY = APP_ROOT / "providers" / "media" / "genblaze.py"
GMICLOUD_BOUNDARY = APP_ROOT / "providers" / "media" / "gmicloud.py"


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def test_gmicloud_imports_are_confined_to_registration_boundary() -> None:
    offenders = [
        str(path.relative_to(APP_ROOT))
        for path in APP_ROOT.rglob("*.py")
        if path != GMICLOUD_BOUNDARY
        and any(name.startswith("genblaze_gmicloud") for name in _imports(path))
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
    assert "GMICloudImageProvider(" not in source
    assert "GMICloudVideoProvider(" not in source
    assert "GMICloudAudioProvider(" not in source


def test_tasks_do_not_import_concrete_media_providers() -> None:
    offenders = [
        str(path.relative_to(APP_ROOT))
        for path in (APP_ROOT / "tasks").glob("*.py")
        if any(name.startswith("genblaze_gmicloud") for name in _imports(path))
        or any(
            concrete in path.read_text(encoding="utf-8")
            for concrete in (
                "GMICloudImageProvider",
                "GMICloudVideoProvider",
                "GMICloudAudioProvider",
            )
        )
    ]
    assert offenders == []


def test_scene_pipeline_is_provider_neutral_about_video_handoff() -> None:
    tree = ast.parse(GENBLAZE_BOUNDARY.read_text(encoding="utf-8"))
    scene_class = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef)
        and node.name == "GenblazeSceneGenerator"
    )
    video_pipeline = next(
        node
        for node in scene_class.body
        if isinstance(node, ast.FunctionDef) and node.name == "_video_pipeline"
    )
    comparisons = [
        node for node in ast.walk(video_pipeline) if isinstance(node, ast.Compare)
    ]
    step_keywords = [
        keyword.arg
        for node in ast.walk(video_pipeline)
        if isinstance(node, ast.Call)
        for keyword in node.keywords
    ]

    assert not any("gmicloud" in ast.unparse(node) for node in comparisons)
    assert "image" not in step_keywords


def test_gmicloud_module_owns_signed_url_video_handoff() -> None:
    source = GMICLOUD_BOUNDARY.read_text(encoding="utf-8")
    assert "_signed_url_video_inputs" in source
    assert 'return {"image": signed_image_url}' in source
