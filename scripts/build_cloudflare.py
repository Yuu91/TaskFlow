"""Build a separate static Pages artifact. Never edits or deletes app sources."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "dist-cloudflare"
APP_FILES = (
    "index.html", "style.css", "script.js", "recommendation.js", "pwa.js",
    "manifest.webmanifest", "sw.js", "icons/icon-192.png",
    "icons/icon-512.png", "icons/apple-touch-icon.png",
)


def reject_link(path):
    """Also reject Windows junctions/reparse points, including dangling links."""
    if not os.path.lexists(path):
        return
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
        raise ValueError(f"リンク・再解析ポイントは使用できません: {path}")


def checked(path):
    relative = path.relative_to(ROOT)
    current = ROOT
    reject_link(current)
    for part in relative.parts:
        current = current / part
        reject_link(current)
    return path


def payload():
    config = json.loads(checked(ROOT / "cloudflare-build.json").read_text(encoding="utf-8"))
    version = config["cacheVersion"]
    if type(version) is not int or version < 1:
        raise ValueError("cacheVersionは正の整数で指定してください")
    result = {"app/" + name: checked(ROOT / name).read_bytes() for name in APP_FILES}
    # Cloudflare needs canonical directory HTML responses; leave GitHub worker untouched.
    result["app/sw.js"] = checked(ROOT / "scripts/cloudflare-sw.js").read_bytes()
    manifest = json.loads(result["app/manifest.webmanifest"])
    manifest.update(id="/app/", scope="./", start_url="./")
    result["app/manifest.webmanifest"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    for source, destination in (
        ("index.html", "index.html"), ("landing.css", "landing.css"),
        ("migration/index.html", "migration/index.html"), ("404.html", "404.html"),
        ("recovery/index.html", "recovery/index.html"),
    ):
        result[destination] = checked(ROOT / "landing" / source).read_bytes()
    assets = checked(ROOT / "landing/assets")
    for path in sorted(assets.iterdir()):
        checked(path)
        if path.is_file() and path.suffix.lower() in {".webp", ".png", ".jpg", ".jpeg", ".avif"}:
            result["assets/" + path.name] = path.read_bytes()
    # Hash app content, including worker logic, so forgetting the manual version
    # cannot reuse an old cache. Landing-only changes do not invalidate the app.
    digest = hashlib.sha256()
    for name, data in sorted(result.items()):
        if name.startswith("app/"):
            digest.update(name.encode() + b"\0" + data + b"\0")
    cache = f"seedonext-cloudflare-shell-v{version}-{digest.hexdigest()[:16]}"
    worker = result["app/sw.js"].decode("utf-8")
    worker, count = re.subn(r'const CACHE_NAME = "[^"\r\n]+";', f'const CACHE_NAME = "{cache}";', worker)
    if count != 1:
        raise ValueError("Service Workerのキャッシュ名を一意に検出できません")
    result["app/sw.js"] = worker.encode("utf-8")
    return result, cache


def build():
    # No output argument, no recursive deletion, no shell commands.
    if len(sys.argv) != 1:
        raise ValueError("引数は指定できません。出力先はdist-cloudflare/固定です")
    files, cache = payload()
    checked(OUTPUT)
    if OUTPUT.exists():
        if not OUTPUT.is_dir():
            raise ValueError("出力先がディレクトリではありません")
        # Validate the entire tree BEFORE writing anything. Unknown old assets
        # cause a failure instead of being silently retained or deleted.
        for directory, folders, names in os.walk(OUTPUT, followlinks=False):
            for name in folders + names:
                path = checked(Path(directory) / name)
                if path.is_file() and path.relative_to(OUTPUT).as_posix() not in files:
                    raise ValueError(f"生成先に未知のファイルがあります。内容を確認してください: {path}")
    for name in files:
        target = checked(OUTPUT / name)
        if target.exists() and not target.is_file():
            raise ValueError(f"生成ファイルと同名のディレクトリがあります: {target}")
    for name, data in files.items():
        target = checked(OUTPUT / name)
        target.parent.mkdir(parents=True, exist_ok=True)
        checked(target).write_bytes(data)
    print(f"Generated {len(files)} files in {OUTPUT.name}/")
    print(f"Cache: {cache}")


if __name__ == "__main__":
    try:
        build()
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        sys.exit(f"Build stopped: {error}")
