"""Run: python -B tests/cloudflare_build_test.py. No browser storage is used."""
import importlib.util
from html.parser import HTMLParser
import json
import posixpath
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("builder", ROOT / "scripts/build_cloudflare.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BuildTests(unittest.TestCase):
    def test_generated_local_links_and_resources(self):
        files, _ = builder.payload()
        class Links(HTMLParser):
            def __init__(self):
                super().__init__()
                self.links = []
            def handle_starttag(self, tag, attrs):
                for key, value in attrs:
                    if key in {"href", "src"} and value:
                        self.links.append(value)
        for name, data in files.items():
            if not name.endswith(".html"):
                continue
            parser = Links()
            parser.feed(data.decode("utf-8"))
            for link in parser.links:
                url = urlsplit(link)
                if url.scheme or url.netloc or not url.path:
                    continue
                path = unquote(url.path)
                resolved = posixpath.normpath(path.lstrip("/") if path.startswith("/") else posixpath.join(posixpath.dirname(name), path))
                if resolved == ".":
                    resolved = "index.html"
                elif path.endswith("/"):
                    resolved += "/index.html"
                self.assertIn(resolved, files, f"{name}: broken link {link}")

    def test_app_preserved_and_manifest_scoped(self):
        files, cache = builder.payload()
        for name in builder.APP_FILES:
            if name not in {"manifest.webmanifest", "sw.js"}:
                self.assertEqual(files["app/" + name], (ROOT / name).read_bytes())
        manifest = json.loads(files["app/manifest.webmanifest"])
        self.assertEqual([manifest[k] for k in ("id", "scope", "start_url")], ["/app/", "./", "./"])
        worker = (ROOT / "scripts/cloudflare-sw.js").read_bytes().decode("utf-8")
        self.assertEqual(files["app/sw.js"].decode(), worker.replace('"seedonext-cloudflare-shell-template"', json.dumps(cache)))
        self.assertTrue(cache.startswith("seedonext-cloudflare-shell-v2-"))

    def test_reproducible(self):
        self.assertEqual(builder.payload(), builder.payload())

    def test_argument_cannot_select_output(self):
        with patch.object(sys, "argv", ["build", "C:/"]):
            with self.assertRaises(ValueError):
                builder.build()

    def test_unknown_output_preserved_and_build_stops(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as temporary:
            output = Path(temporary) / "dist-cloudflare"
            output.mkdir()
            sentinel = output / "private.json"
            sentinel.write_text("keep")
            with patch.object(builder, "OUTPUT", output), patch.object(sys, "argv", ["build"]):
                with self.assertRaises(ValueError):
                    builder.build()
            self.assertEqual(sentinel.read_text(), "keep")
            self.assertFalse((output / "index.html").exists())

    def test_reparse_point_rejected(self):
        from types import SimpleNamespace
        with patch.object(builder.os.path, "lexists", return_value=True):
            with patch.object(Path, "lstat", return_value=SimpleNamespace(st_mode=0, st_file_attributes=0x400)):
                with self.assertRaises(ValueError):
                    builder.reject_link(ROOT / "dist-cloudflare")

    def test_content_change_rotates_cache(self):
        _, before = builder.payload()
        original = Path.read_bytes
        def changed(path):
            data = original(path)
            return data + b"\n// test change" if path == ROOT / "script.js" else data
        with patch.object(Path, "read_bytes", changed):
            _, after = builder.payload()
        self.assertNotEqual(before, after)

    def test_worker_template_change_rotates_cache(self):
        _, before = builder.payload()
        original = Path.read_bytes
        def changed(path):
            data = original(path)
            return data + b"\n// test template change" if path == ROOT / "scripts/cloudflare-sw.js" else data
        with patch.object(Path, "read_bytes", changed):
            _, after = builder.payload()
        self.assertNotEqual(before, after)


if __name__ == "__main__":
    unittest.main()
