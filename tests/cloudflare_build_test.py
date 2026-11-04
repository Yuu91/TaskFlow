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
            if name not in {"manifest.webmanifest", "sw.js", "index.html"}:
                self.assertEqual(files["app/" + name], (ROOT / name).read_bytes())
        self.assertEqual(files["app/index.html"].replace((builder.analytics_snippet() + "\n").encode(), b"").replace((builder.adsense_snippet() + "\n").encode(), b""), (ROOT / "index.html").read_bytes())
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

    def analytics_tags(self, data):
        class Tags(HTMLParser):
            def __init__(self):
                super().__init__()
                self.beacons = []
            def handle_starttag(self, tag, attrs):
                item = dict(attrs)
                if tag == "script" and item.get("src", "").startswith("https://static.cloudflareinsights.com/beacon.min.js"):
                    self.beacons.append(item)
        parser = Tags()
        parser.feed(data.decode("utf-8"))
        return parser.beacons

    def test_analytics_is_only_on_four_generated_pages_once(self):
        files, _ = builder.payload()
        for name in builder.ANALYTICS_PAGES:
            tags = self.analytics_tags(files[name])
            self.assertEqual(len(tags), 1, name)
            self.assertEqual(tags[0]["type"], "module")
            self.assertEqual(json.loads(tags[0]["data-cf-beacon"]), {"token": "e54c00c177484f50a1b3ef31420957ad"})
            self.assertLess(files[name].index(b"<!-- Cloudflare Web Analytics -->"), files[name].lower().index(b"</body>"))
        self.assertFalse(self.analytics_tags(files["404.html"]))
        for name in ["index.html", "landing/index.html", "landing/migration/index.html", "landing/recovery/index.html"]:
            self.assertFalse(self.analytics_tags((ROOT / name).read_bytes()), name)

    def test_analytics_insertion_is_idempotent(self):
        for original in [b"<html><body>test</body></html>", b"<HTML><BODY>test</BODY></HTML>"]:
            once = builder.with_analytics(original)
            self.assertEqual(builder.with_analytics(once), once)
            self.assertEqual(len(self.analytics_tags(once)), 1)
        existing = ("<body>" + builder.analytics_snippet() + "</body>").encode()
        self.assertEqual(builder.with_analytics(existing), existing)

    def test_analytics_conflict_duplicate_and_invalid_html_stop_build(self):
        snippet = builder.analytics_snippet()
        for source in [
            "<body>" + snippet + snippet + "</body>",
            ("<body>" + snippet + "</body>").replace(builder.ANALYTICS_TOKEN, "0" * 32),
            "<html>missing body</html>",
        ]:
            with self.subTest(source=source[:50]), self.assertRaises(ValueError):
                builder.with_analytics(source.encode())

    def test_analytics_token_change_rotates_app_cache(self):
        files, before = builder.payload()
        with patch.object(builder, "ANALYTICS_TOKEN", "0" * 32):
            changed, after = builder.payload()
        self.assertNotEqual(before, after)
        self.assertNotEqual(files["app/index.html"], changed["app/index.html"])

    def test_analytics_is_not_in_worker_or_precache(self):
        files, _ = builder.payload()
        worker = files["app/sw.js"].decode()
        self.assertNotIn("cloudflareinsights.com", worker)
        self.assertNotIn(builder.ANALYTICS_TOKEN, worker)
        self.assertNotIn("localStorage", builder.analytics_snippet())
        # App code and stored-data handling are copied without modification.
        for name in ["script.js", "pwa.js", "recommendation.js"]:
            self.assertEqual(files["app/" + name], (ROOT / name).read_bytes())

    def adsense_tags(self, data):
        class Tags(HTMLParser):
            def __init__(self):
                super().__init__()
                self.in_head = False
                self.items = []
            def handle_starttag(self, tag, attrs):
                if tag == "head":
                    self.in_head = True
                item = dict(attrs)
                if tag == "script" and "pagead2.googlesyndication.com/pagead/js/adsbygoogle.js" in (item.get("src") or ""):
                    self.items.append((item, self.in_head))
            def handle_endtag(self, tag):
                if tag == "head":
                    self.in_head = False
        parser = Tags()
        parser.feed(data.decode())
        return parser.items

    def test_adsense_is_once_inside_head_on_four_cloudflare_pages(self):
        files, _ = builder.payload()
        for name in builder.ADSENSE_PAGES:
            tags = self.adsense_tags(files[name])
            self.assertEqual(len(tags), 1, name)
            tag, in_head = tags[0]
            self.assertTrue(in_head, name)
            self.assertEqual(tag["src"], "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8268684254916846")
            self.assertIn("async", tag)
            self.assertEqual(tag["crossorigin"], "anonymous")
            self.assertEqual(len(self.analytics_tags(files[name])), 1)
            self.assertNotIn(b'<ins class="adsbygoogle"', files[name])
            self.assertNotIn(b"adsbygoogle.push", files[name])
        self.assertFalse(self.adsense_tags(files["404.html"]))
        for name in ["index.html", "landing/index.html", "landing/migration/index.html", "landing/recovery/index.html"]:
            self.assertFalse(self.adsense_tags((ROOT / name).read_bytes()), name)
        self.assertNotIn(b"googlesyndication.com", files["app/sw.js"])

    def test_adsense_insertion_is_idempotent(self):
        for original in [b"<html><head></head><body>test</body></html>", b"<HTML><HEAD></HEAD><BODY>test</BODY></HTML>"]:
            once = builder.with_adsense(original)
            self.assertEqual(builder.with_adsense(once), once)
            self.assertEqual(len(self.adsense_tags(once)), 1)
        valid = ("<head>" + builder.adsense_snippet() + "</head>").encode()
        self.assertEqual(builder.with_adsense(valid), valid)

    def test_adsense_duplicates_wrong_publisher_and_wrong_location_stop_build(self):
        tag = builder.adsense_snippet()
        for source in [
            "<head>" + tag + tag + "</head>",
            ("<head>" + tag + "</head>").replace(builder.ADSENSE_CLIENT, "ca-pub-0000000000000000"),
            "<head></head><body>" + tag + "</body>",
            "<head>" + tag.replace(" async", "") + "</head>",
            "<body>no head</body>",
        ]:
            with self.subTest(source=source[:50]), self.assertRaises(ValueError):
                builder.with_adsense(source.encode())

    def test_adsense_and_analytics_remain_single_on_repeated_insertion(self):
        source = b"<html><head></head><body>keep content</body></html>"
        for apply in [
            lambda data: builder.with_adsense(builder.with_analytics(data)),
            lambda data: builder.with_analytics(builder.with_adsense(data)),
        ]:
            once = apply(source)
            self.assertEqual(apply(once), once)
            self.assertEqual(len(self.adsense_tags(once)), 1)
            self.assertEqual(len(self.analytics_tags(once)), 1)

    def test_adsense_client_change_rotates_app_cache(self):
        files, before = builder.payload()
        with patch.object(builder, "ADSENSE_CLIENT", "ca-pub-0000000000000000"):
            changed, after = builder.payload()
        self.assertNotEqual(before, after)
        self.assertNotEqual(files["app/index.html"], changed["app/index.html"])
        for name in ["script.js", "pwa.js", "recommendation.js"]:
            self.assertEqual(files["app/" + name], (ROOT / name).read_bytes())


if __name__ == "__main__":
    unittest.main()
