"""Build a separate static Pages artifact. Never edits or deletes app sources."""
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import stat
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "dist-cloudflare"
SEARCH_CONSOLE_FILE = "google4ab1bc7e104c5f27.html"
APP_FILES = (
    "index.html", "style.css", "script.js", "recommendation.js", "pwa.js",
    "manifest.webmanifest", "sw.js", "icons/icon-192.png",
    "icons/icon-512.png", "icons/apple-touch-icon.png",
)


ANALYTICS_TOKEN = "e54c00c177484f50a1b3ef31420957ad"
ANALYTICS_SRC = "https://static.cloudflareinsights.com/beacon.min.js"
ANALYTICS_PAGES = ("index.html", "app/index.html", "migration/index.html", "recovery/index.html")


def analytics_snippet():
    config = json.dumps({"token": ANALYTICS_TOKEN})
    return (
        "<!-- Cloudflare Web Analytics -->"
        f"<script type='module' src='{ANALYTICS_SRC}' data-cf-beacon='{config}'></script>"
        "<!-- End Cloudflare Web Analytics -->"
    )


def with_analytics(data):
    """Inject only into build output; preserve an existing single valid beacon."""
    html = data.decode("utf-8")
    class Beacons(HTMLParser):
        def __init__(self):
            super().__init__()
            self.items = []
        def handle_starttag(self, tag, attrs):
            values = dict(attrs)
            src = urlsplit(values.get("src", ""))
            if tag == "script" and ("data-cf-beacon" in values or
                    (src.hostname == "static.cloudflareinsights.com" and src.path == "/beacon.min.js")):
                self.items.append(values)
    parsed = Beacons()
    parsed.feed(html)
    if parsed.items:
        if len(parsed.items) != 1:
            raise ValueError("Duplicate Cloudflare Web Analytics snippets")
        item = parsed.items[0]
        try:
            token = json.loads(item.get("data-cf-beacon") or "{}").get("token")
        except (ValueError, AttributeError):
            raise ValueError("Invalid Cloudflare Web Analytics configuration")
        if item.get("src") != ANALYTICS_SRC or token != ANALYTICS_TOKEN:
            raise ValueError("Conflicting Cloudflare Web Analytics snippet")
        return data
    end = re.search(r"</body\s*>", html, flags=re.IGNORECASE)
    if not end:
        raise ValueError("Analytics page must have a closing body tag")
    return (html[:end.start()] + analytics_snippet() + "\n" + html[end.start():]).encode("utf-8")


ADSENSE_CLIENT = "ca-pub-8268684254916846"
ADSENSE_SCRIPT = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"
ADSENSE_PAGES = ("index.html", "app/index.html", "migration/index.html", "recovery/index.html")


def adsense_snippet():
    return f'<script async src="{ADSENSE_SCRIPT}?client={ADSENSE_CLIENT}" crossorigin="anonymous"></script>'


def with_adsense(data):
    """Add the supplied site verification script once, within generated head only."""
    html = data.decode("utf-8")
    class Scripts(HTMLParser):
        def __init__(self):
            super().__init__()
            self.in_head = False
            self.items = []
        def handle_starttag(self, tag, attrs):
            if tag == "head":
                self.in_head = True
            item = dict(attrs)
            src = urlsplit(item.get("src") or "")
            if tag == "script" and src.hostname == "pagead2.googlesyndication.com" and src.path == "/pagead/js/adsbygoogle.js":
                self.items.append((item, self.in_head))
        def handle_endtag(self, tag):
            if tag == "head":
                self.in_head = False
    parsed = Scripts()
    parsed.feed(html)
    if parsed.items:
        if len(parsed.items) != 1:
            raise ValueError("Duplicate AdSense scripts")
        item, in_head = parsed.items[0]
        if (not in_head or item.get("src") != f"{ADSENSE_SCRIPT}?client={ADSENSE_CLIENT}"
                or "async" not in item or item.get("crossorigin") != "anonymous"):
            raise ValueError("Conflicting or misplaced AdSense verification script")
        return data
    end = re.search(r"</head\s*>", html, flags=re.IGNORECASE)
    if not end:
        raise ValueError("AdSense page must have a closing head tag")
    return (html[:end.start()] + adsense_snippet() + "\n" + html[end.start():]).encode("utf-8")


PRIVACY_MENU_LINK = '<a id="cloudflarePrivacyPolicyLink" href="../privacy/" target="_blank" rel="noopener" style="display:block;padding:15px 0">プライバシーポリシー（新しいタブ）</a>'
PRIVACY_GUIDE_LINK = '<p id="cloudflarePrivacyNotice">Cloudflare版のアクセス解析・広告・Cookieについては、<a href="../privacy/" target="_blank" rel="noopener">プライバシーポリシー（新しいタブ）</a>をご確認ください。</p>'


def with_app_privacy_links(data):
    """Add links only to the Cloudflare output; preserve GitHub HTML."""
    html = data.decode("utf-8")
    ids = ('id="cloudflarePrivacyPolicyLink"', 'id="cloudflarePrivacyNotice"')
    if any(marker in html for marker in ids):
        if all(html.count(marker) == 1 for marker in ids) and PRIVACY_MENU_LINK in html and PRIVACY_GUIDE_LINK in html:
            return data
        raise ValueError("Conflicting or duplicate privacy links")
    menu = re.search(r'<button id="menuPrivacyButton"[^>]*>[\s\S]*?</button>', html)
    if not menu:
        raise ValueError("Cannot find app privacy menu")
    html = html[:menu.end()] + PRIVACY_MENU_LINK + html[menu.end():]
    guide = re.search(r'<details id="privacyGuide"[^>]*>\s*<summary>[\s\S]*?</summary>', html)
    if not guide:
        raise ValueError("Cannot find app privacy guide")
    return (html[:guide.end()] + PRIVACY_GUIDE_LINK + html[guide.end():]).encode("utf-8")


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
        ("privacy/index.html", "privacy/index.html"),
        ("ads.txt", "ads.txt"),
    ):
        result[destination] = checked(ROOT / "landing" / source).read_bytes()
    # Use the downloaded original unchanged. Never synthesize verification content.
    verification = checked(ROOT / SEARCH_CONSOLE_FILE).read_bytes()
    result[SEARCH_CONSOLE_FILE] = verification
    # Avoid Pages' automatic .html canonical redirect for this exact URL only.
    verification_target = SEARCH_CONSOLE_FILE.removesuffix(".html") + "-verification.txt"
    result[verification_target] = verification
    result["_redirects"] = f"/{SEARCH_CONSOLE_FILE} /{verification_target} 200\n".encode("ascii")
    assets = checked(ROOT / "landing/assets")
    for path in sorted(assets.iterdir()):
        checked(path)
        if path.is_file() and path.suffix.lower() in {".webp", ".png", ".jpg", ".jpeg", ".avif"}:
            result["assets/" + path.name] = path.read_bytes()
    for name in ANALYTICS_PAGES:
        result[name] = with_analytics(result[name])
    for name in ADSENSE_PAGES:
        result[name] = with_adsense(result[name])
    result["app/index.html"] = with_app_privacy_links(result["app/index.html"])
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
