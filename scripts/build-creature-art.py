#!/usr/bin/env python3
"""Build or validate pinned Heroes of Legend creature-art derivatives."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path, PurePosixPath
from typing import Any

try:
    from PIL import Image, features
except ImportError as error:  # pragma: no cover - dependency failure is environment-specific
    raise SystemExit(
        "Pillow is required. Follow the virtual-environment setup in "
        "content/README.md, then rerun this command."
    ) from error


ROOT = Path(__file__).resolve().parent.parent
LOCK_PATH = ROOT / "content" / "source-lock.json"
ART_DIR = ROOT / "static" / "assets" / "creatures"
MANIFEST_PATH = ART_DIR / "manifest.json"
RUNTIME_PREFIX = "assets/creatures"
REPOSITORY_PREFIX = f"static/{RUNTIME_PREFIX}"
SCHEMA_VERSION = 1
WEBP_QUALITY = 85
WEBP_METHOD = 6
ALPHA_QUALITY = 100
MAX_EDGE = 768
SHA256_LENGTH = 64
# Reviewed provenance for the checked-in bytes. Update with the manifest and
# Node release baseline when a regeneration intentionally changes encoders.
PILLOW_ENCODER_VERSION = "12.1.1"
WEBP_ENCODER_VERSION = "1.5.0"


class ArtError(RuntimeError):
    """A reviewed source or generated-art invariant failed."""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_lock() -> dict[str, Any]:
    lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    if lock.get("schemaVersion") != 1:
        raise ArtError("Unsupported source-lock schema")
    commit = lock.get("commit")
    if not isinstance(commit, str) or len(commit) != 40 or any(
        character not in "0123456789abcdef" for character in commit
    ):
        raise ArtError("Source lock does not contain a full pinned commit")
    assets = lock.get("assets")
    if not isinstance(assets, list) or len(assets) != 192:
        raise ArtError("Source lock must contain exactly 192 portrait records")
    if lock.get("counts", {}).get("portraits") != len(assets):
        raise ArtError("Source-lock portrait count does not match its records")
    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    for record in assets:
        validate_portrait_record(record)
        if record["id"] in seen_ids:
            raise ArtError(f"Duplicate portrait ID: {record['id']}")
        if record["path"] in seen_paths:
            raise ArtError(f"Duplicate portrait path: {record['path']}")
        seen_ids.add(record["id"])
        seen_paths.add(record["path"])
    return lock


def validate_portrait_record(record: dict[str, Any]) -> None:
    required_strings = ("id", "path", "sha256", "provenance")
    for key in required_strings:
        if not isinstance(record.get(key), str) or not record[key]:
            raise ArtError(f"Invalid portrait {key}: {record.get('id', '<unknown>')}")
    path = PurePosixPath(record["path"])
    if (
        path.is_absolute()
        or "\\" in record["path"]
        or any(part in ("", ".", "..") for part in path.parts)
    ):
        raise ArtError(f"Unsafe portrait source path: {record['path']}")
    digest = record["sha256"]
    if len(digest) != SHA256_LENGTH or any(
        character not in "0123456789abcdef" for character in digest
    ):
        raise ArtError(f"Invalid source hash: {record['id']}")
    for key in ("width", "height"):
        if not isinstance(record.get(key), int) or record[key] <= 0:
            raise ArtError(f"Invalid portrait {key}: {record['id']}")
    if not isinstance(record.get("alpha"), bool):
        raise ArtError(f"Invalid portrait alpha flag: {record['id']}")


def git_blob(repository: Path, commit: str, path: str) -> bytes:
    result = subprocess.run(
        [
            "git",
            "-C",
            str(repository),
            "cat-file",
            "blob",
            f"{commit}:{path}",
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise ArtError(f"Unable to read pinned Git blob {path}: {message}")
    return result.stdout


def verify_repository(repository: Path, commit: str) -> None:
    result = subprocess.run(
        ["git", "-C", str(repository), "cat-file", "-e", f"{commit}^{{commit}}"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode:
        raise ArtError(f"Book repository does not contain pinned commit {commit}")


def image_info(data: bytes, label: str) -> dict[str, Any]:
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            alpha = "A" in image.getbands() or "transparency" in image.info
            return {
                "width": image.width,
                "height": image.height,
                "alpha": alpha,
                "mode": image.mode,
            }
    except Exception as error:
        raise ArtError(f"Unable to decode {label}: {error}") from error


def require_webp_decoder() -> None:
    if not features.check("webp"):
        raise ArtError("Pillow WebP decoder is unavailable")
    if not features.version("webp"):
        raise ArtError("Pillow WebP decoder version is unavailable")


def derived_dimensions(width: int, height: int) -> tuple[int, int]:
    """Nearest whole-pixel aspect fit, with no upscaling or cropping."""
    longest = max(width, height)
    if longest <= MAX_EDGE:
        return width, height
    return (
        max(1, (width * MAX_EDGE + longest // 2) // longest),
        max(1, (height * MAX_EDGE + longest // 2) // longest),
    )


def encode_webp(data: bytes, label: str, expected: dict[str, Any]) -> tuple[bytes, dict[str, Any]]:
    try:
        with Image.open(io.BytesIO(data)) as source:
            source.load()
            if source.width != expected["width"] or source.height != expected["height"]:
                raise ArtError(
                    f"Source dimensions changed for {label}: "
                    f"{source.width}x{source.height}"
                )
            source_has_alpha = (
                "A" in source.getbands() or "transparency" in source.info
            )
            if source_has_alpha != expected["alpha"]:
                raise ArtError(f"Source alpha flag changed for {label}")
            working = source.convert("RGBA") if source_has_alpha else source.convert("RGB")
            output_dimensions = derived_dimensions(source.width, source.height)
            if working.size != output_dimensions:
                working = working.resize(output_dimensions, Image.Resampling.LANCZOS)
            resized_alpha = (
                working.getchannel("A").tobytes() if source_has_alpha else None
            )
            output = io.BytesIO()
            working.save(
                output,
                format="WEBP",
                quality=WEBP_QUALITY,
                method=WEBP_METHOD,
                lossless=False,
                exact=True,
                alpha_quality=ALPHA_QUALITY,
            )
            encoded = output.getvalue()
    except ArtError:
        raise
    except Exception as error:
        raise ArtError(f"Unable to encode {label}: {error}") from error

    decoded = image_info(encoded, f"derived image for {label}")
    if (decoded["width"], decoded["height"]) != output_dimensions:
        raise ArtError(f"Derived dimensions changed for {label}")
    if decoded["alpha"] != expected["alpha"]:
        raise ArtError(f"Derived alpha channel changed for {label}")
    if resized_alpha is not None:
        with Image.open(io.BytesIO(encoded)) as image:
            image.load()
            if image.convert("RGBA").getchannel("A").tobytes() != resized_alpha:
                raise ArtError(f"Derived resampled alpha values changed for {label}")
    return encoded, decoded


def encode_asset_task(task: tuple[str, bytes, str, dict[str, Any]]) -> tuple[str, bytes, dict[str, Any]]:
    """Picklable worker; source pin validation and manifest assembly stay in the parent."""
    source_hash, data, label, note = task
    encoded, decoded = encode_webp(data, label, note)
    return source_hash, encoded, decoded


def encode_assets(tasks: list[tuple[str, bytes, str, dict[str, Any]]], workers: int):
    if not isinstance(workers, int) or not 1 <= workers <= 8:
        raise ArtError("Choose 1–8 creature-art encode workers")
    if workers == 1:
        yield from map(encode_asset_task, tasks)
    else:
        with ProcessPoolExecutor(max_workers=workers) as executor:
            # map preserves input order; worker exceptions propagate before any files are written.
            yield from executor.map(encode_asset_task, tasks)


def expected_manifest(lock: dict[str, Any], repository: Path, workers: int = 8) -> tuple[dict[str, Any], dict[str, bytes]]:
    commit = lock["commit"]
    verify_repository(repository, commit)
    generated: dict[str, bytes] = {}
    assets_by_source_hash: dict[str, dict[str, Any]] = {}
    source_notes: dict[str, dict[str, Any]] = {}
    inputs: dict[str, tuple[str, bytes, str, dict[str, Any]]] = {}
    portraits: list[dict[str, Any]] = []
    mapping_counts: Counter[str] = Counter()
    unique_source_bytes = 0
    records = sorted(lock["assets"], key=lambda item: item["id"])

    for record in records:
        data = git_blob(repository, commit, record["path"])
        source_hash = sha256(data)
        if source_hash != record["sha256"]:
            raise ArtError(
                f"Source hash mismatch for {record['id']}: expected "
                f"{record['sha256']}, read {source_hash}"
            )
        note = {"width": record["width"], "height": record["height"], "alpha": record["alpha"]}
        if source_hash not in source_notes:
            info = image_info(data, f"source {record['id']}")
            if any(info[key] != note[key] for key in note):
                raise ArtError(f"Source metadata mismatch for {record['id']}")
            source_notes[source_hash] = note
            inputs[source_hash] = (source_hash, data, record["id"], note)
            unique_source_bytes += len(data)
        elif source_notes[source_hash] != note:
            raise ArtError(f"Shared source metadata disagrees for {record['id']}")

    print(f"Validated {len(records)} pinned portrait sources; encoding {len(inputs)} assets with {workers} workers.", file=sys.stderr, flush=True)
    for index, (source_hash, encoded, decoded) in enumerate(encode_assets(list(inputs.values()), workers), 1):
        filename = f"{source_hash}.webp"
        runtime_path = f"{RUNTIME_PREFIX}/{filename}"
        asset = {
            "bytes": len(encoded),
            "hasAlpha": decoded["alpha"],
            "height": decoded["height"],
            "repositoryPath": f"{REPOSITORY_PREFIX}/{filename}",
            "runtimePath": runtime_path,
            "sha256": sha256(encoded),
            "sourceBytes": len(inputs[source_hash][1]),
            "sourceSha256": source_hash,
            "width": decoded["width"],
        }
        assets_by_source_hash[source_hash] = asset
        generated[filename] = encoded
        if index % 16 == 0 or index == len(inputs):
            print(f"Encoded {index}/{len(inputs)} creature-art assets.", file=sys.stderr, flush=True)

    for record in records:
        source_hash = record["sha256"]
        asset = assets_by_source_hash[source_hash]
        portraits.append({
            "alpha": record["alpha"], "asset": asset["runtimePath"],
            "height": record["height"], "id": record["id"],
            "provenance": record["provenance"], "sourcePath": record["path"],
            "sourceSha256": source_hash, "width": record["width"],
        })
        mapping_counts[record["provenance"]] += 1

    assets = sorted(
        assets_by_source_hash.values(), key=lambda item: item["runtimePath"]
    )
    total_bytes = sum(asset["bytes"] for asset in assets)
    manifest = {
        "assets": assets,
        "encoding": {
            "alphaQuality": ALPHA_QUALITY,
            "exact": True,
            "format": "webp",
            "libraries": {
                "pillow": Image.__version__,
                "webp": features.version("webp"),
            },
            "lossless": False,
            "method": WEBP_METHOD,
            "nativeDimensions": False,
            "maxEdge": MAX_EDGE,
            "resample": "lanczos",
            "allowUpscale": False,
            "quality": WEBP_QUALITY,
        },
        "portraits": sorted(portraits, key=lambda item: item["id"]),
        "report": {
            "mappingCountsByProvenance": dict(sorted(mapping_counts.items())),
            "sourceBytes": unique_source_bytes,
            "totalBytes": total_bytes,
        },
        "rights": {
            "distributionLicense": "undecided",
            "note": "No distribution-rights assumption is made by this manifest.",
        },
        "schemaVersion": SCHEMA_VERSION,
        "source": {
            "access": "git-blob",
            "commit": commit,
            "lockPath": "content/source-lock.json",
            "lockSha256": sha256(LOCK_PATH.read_bytes()),
            "repository": lock["repository"],
        },
        "summary": {
            "portraitMappings": len(portraits),
            "uniqueAssets": len(assets),
        },
    }
    return manifest, generated


def manifest_bytes(manifest: dict[str, Any]) -> bytes:
    return (
        json.dumps(
            manifest,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n"
    ).encode("utf-8")


def write_if_changed(path: Path, data: bytes) -> None:
    if path.is_file() and path.read_bytes() == data:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_bytes(data)
    os.replace(temporary, path)


def validate_artifacts() -> dict[str, Any]:
    lock = load_lock()
    if not ART_DIR.is_dir():
        raise ArtError("Creature art directory is missing")
    if not MANIFEST_PATH.is_file():
        raise ArtError("Creature art manifest is missing")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if MANIFEST_PATH.read_bytes() != manifest_bytes(manifest):
        raise ArtError("Creature art manifest serialization is not deterministic")
    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        raise ArtError("Unsupported creature-art manifest schema")
    source = manifest.get("source", {})
    if (
        source.get("access") != "git-blob"
        or source.get("lockPath") != "content/source-lock.json"
        or source.get("repository") != lock["repository"]
    ):
        raise ArtError("Creature-art source provenance is invalid")
    if source.get("commit") != lock["commit"]:
        raise ArtError("Creature art and source lock commits differ")
    if source.get("lockSha256") != sha256(LOCK_PATH.read_bytes()):
        raise ArtError("Creature art manifest is stale for source-lock.json")
    encoding = manifest.get("encoding", {})
    expected_encoding = {
        "format": "webp",
        "quality": WEBP_QUALITY,
        "method": WEBP_METHOD,
        "lossless": False,
        "exact": True,
        "alphaQuality": ALPHA_QUALITY,
        "nativeDimensions": False,
        "maxEdge": MAX_EDGE,
        "resample": "lanczos",
        "allowUpscale": False,
    }
    for key, value in expected_encoding.items():
        if encoding.get(key) != value:
            raise ArtError(f"Unexpected creature-art encoding setting: {key}")
    libraries = encoding.get("libraries")
    if not isinstance(libraries, dict) or set(libraries) != {"pillow", "webp"}:
        raise ArtError("Creature-art encoder provenance is invalid")
    if libraries["pillow"] != PILLOW_ENCODER_VERSION:
        raise ArtError("Pillow encoder version is not pinned")
    if libraries["webp"] != WEBP_ENCODER_VERSION:
        raise ArtError("WebP encoder version is not pinned")
    require_webp_decoder()

    portraits = manifest.get("portraits")
    assets = manifest.get("assets")
    if not isinstance(portraits, list) or not isinstance(assets, list):
        raise ArtError("Creature-art manifest is incomplete")
    if portraits != sorted(portraits, key=lambda item: item["id"]):
        raise ArtError("Creature portrait mappings are not sorted")
    if assets != sorted(assets, key=lambda item: item["runtimePath"]):
        raise ArtError("Creature assets are not sorted")

    lock_records = {record["id"]: record for record in lock["assets"]}
    mapped_ids: set[str] = set()
    asset_paths: set[str] = set()
    for portrait in portraits:
        portrait_id = portrait.get("id")
        if portrait_id not in lock_records:
            raise ArtError(f"Unknown portrait mapping: {portrait_id}")
        if portrait_id in mapped_ids:
            raise ArtError(f"Duplicate portrait mapping: {portrait_id}")
        mapped_ids.add(portrait_id)
        record = lock_records[portrait_id]
        expected = {
            "alpha": record["alpha"],
            "height": record["height"],
            "provenance": record["provenance"],
            "sourcePath": record["path"],
            "sourceSha256": record["sha256"],
            "width": record["width"],
        }
        for key, value in expected.items():
            if portrait.get(key) != value:
                raise ArtError(f"Portrait mapping drift for {portrait_id}: {key}")
        expected_asset = f"{RUNTIME_PREFIX}/{record['sha256']}.webp"
        if portrait.get("asset") != expected_asset:
            raise ArtError(f"Unstable asset path for {portrait_id}")
    if mapped_ids != set(lock_records):
        raise ArtError("Portrait mappings do not cover the source lock")

    actual_names: set[str] = set()
    for path in sorted(ART_DIR.iterdir(), key=lambda item: item.name):
        if not path.is_file() or path.is_symlink():
            raise ArtError(f"Unexpected creature-art entry: {path.name}")
        actual_names.add(path.name)
    expected_names = {"manifest.json"} | {
        PurePosixPath(asset["runtimePath"]).name for asset in assets
    }
    missing = sorted(expected_names - actual_names)
    extra = sorted(actual_names - expected_names)
    if missing:
        raise ArtError(f"Missing creature-art assets: {', '.join(missing)}")
    if extra:
        raise ArtError(f"Unexpected creature-art assets: {', '.join(extra)}")

    referenced_paths: set[str] = set()
    source_bytes = 0
    total_bytes = 0
    for asset in assets:
        runtime_path = asset.get("runtimePath")
        source_hash = asset.get("sourceSha256")
        repository_path = asset.get("repositoryPath")
        if not isinstance(runtime_path, str) or runtime_path in asset_paths:
            raise ArtError(f"Invalid or duplicate asset path: {runtime_path}")
        asset_paths.add(runtime_path)
        if runtime_path != f"{RUNTIME_PREFIX}/{source_hash}.webp":
            raise ArtError(f"Unstable asset path: {runtime_path}")
        if repository_path != f"static/{runtime_path}":
            raise ArtError(f"Repository/runtime path mismatch: {runtime_path}")
        if (
            not isinstance(source_hash, str)
            or len(source_hash) != SHA256_LENGTH
            or any(character not in "0123456789abcdef" for character in source_hash)
        ):
            raise ArtError(f"Invalid source hash for asset: {runtime_path}")
        if (
            not isinstance(asset.get("sourceBytes"), int)
            or asset["sourceBytes"] <= 0
        ):
            raise ArtError(f"Invalid source byte count: {runtime_path}")
        filename = PurePosixPath(runtime_path).name
        data = (ART_DIR / filename).read_bytes()
        output_hash = sha256(data)
        if output_hash != asset.get("sha256"):
            raise ArtError(f"Derived asset hash mismatch: {runtime_path}")
        if len(data) != asset.get("bytes"):
            raise ArtError(f"Derived asset byte count mismatch: {runtime_path}")
        info = image_info(data, runtime_path)
        if (
            info["width"] != asset.get("width")
            or info["height"] != asset.get("height")
            or info["alpha"] != asset.get("hasAlpha")
        ):
            raise ArtError(f"Derived asset metadata mismatch: {runtime_path}")
        mapped = [portrait for portrait in portraits if portrait["asset"] == runtime_path]
        if not mapped:
            raise ArtError(f"Unreferenced creature-art asset: {runtime_path}")
        for portrait in mapped:
            if (
                derived_dimensions(portrait["width"], portrait["height"]) != (info["width"], info["height"])
                or portrait["alpha"] != info["alpha"]
            ):
                raise ArtError(f"Source/output resize policy differs: {portrait['id']}")
        referenced_paths.add(runtime_path)
        source_bytes += asset["sourceBytes"]
        total_bytes += len(data)
    if referenced_paths != asset_paths:
        raise ArtError("Creature-art asset references are incomplete")

    mapping_counts = Counter(
        portrait["provenance"] for portrait in portraits
    )
    report = manifest.get("report", {})
    if report.get("sourceBytes") != source_bytes:
        raise ArtError("Creature-art source byte report is stale")
    if report.get("totalBytes") != total_bytes:
        raise ArtError("Creature-art total byte report is stale")
    if report.get("mappingCountsByProvenance") != dict(sorted(mapping_counts.items())):
        raise ArtError("Creature-art provenance report is stale")
    if manifest.get("summary") != {
        "portraitMappings": len(portraits),
        "uniqueAssets": len(assets),
    }:
        raise ArtError("Creature-art summary is stale")
    if manifest.get("rights", {}).get("distributionLicense") != "undecided":
        raise ArtError("Creature-art rights status must remain undecided")

    return report_for_display(manifest)


def report_for_display(manifest: dict[str, Any]) -> dict[str, Any]:
    report = manifest["report"]
    return {
        "mappings": manifest["summary"]["portraitMappings"],
        "assets": manifest["summary"]["uniqueAssets"],
        "sourceBytes": report["sourceBytes"],
        "totalBytes": report["totalBytes"],
    }


def format_report(report: dict[str, Any]) -> str:
    return (
        f"{report['mappings']} portrait mappings -> {report['assets']} unique WebP "
        f"assets; {report['totalBytes']} runtime bytes from "
        f"{report['sourceBytes']} pinned unique source bytes."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate checked-in derivatives without reading or writing source art",
    )
    parser.add_argument(
        "--book-repository",
        type=Path,
        default=(
            Path(os.environ["HOL_BOOK_REPOSITORY"])
            if os.environ.get("HOL_BOOK_REPOSITORY")
            else None
        ),
        help="local Git repository containing the pinned book commit",
    )
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=8, help="bounded parallel encoders; use 1 for sequential reproduction")
    args = parser.parse_args()

    try:
        if args.check:
            report = validate_artifacts()
            print(f"Validated creature art: {format_report(report)}")
            return 0

        if args.book_repository is None:
            raise ArtError(
                "Set HOL_BOOK_REPOSITORY or pass --book-repository to rebuild art"
            )
        if not args.book_repository.is_dir():
            raise ArtError(f"Book repository does not exist: {args.book_repository}")
        lock = load_lock()
        manifest, generated = expected_manifest(lock, args.book_repository, workers=args.workers)

        ART_DIR.mkdir(parents=True, exist_ok=True)
        expected_names = {"manifest.json"} | set(generated)
        unexpected = sorted(
            path.name for path in ART_DIR.iterdir() if path.name not in expected_names
        )
        if unexpected:
            raise ArtError(
                "Unexpected files exist in the generated creature-art directory: "
                + ", ".join(unexpected)
            )
        for filename in sorted(generated):
            write_if_changed(ART_DIR / filename, generated[filename])
        write_if_changed(MANIFEST_PATH, manifest_bytes(manifest))
        report = validate_artifacts()
        print(f"Built and validated creature art: {format_report(report)}")
        return 0
    except ArtError as error:
        print(f"Creature art error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
