"""Real Chromium regression tests; standard library only, isolated temporary profile.
Run: python -B tests/service_worker_browser_test.py
Never accesses a user's browser profile or real task storage.
"""
import base64
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import struct
import sys
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.request
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("cf_builder", ROOT / "scripts/build_cloudflare.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class CDP:
    def __init__(self, url):
        u = urlsplit(url)
        self.sock = socket.create_connection((u.hostname, u.port), timeout=25)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET {u.path} HTTP/1.1\r\nHost: {u.netloc}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        header = b""
        while not header.endswith(b"\r\n\r\n"):
            header += self.sock.recv(1)
        if b" 101 " not in header:
            raise RuntimeError(header.decode())
        self.sequence = 0

    def read(self, count):
        data = b""
        while len(data) < count:
            part = self.sock.recv(count - len(data))
            if not part:
                raise RuntimeError("CDP connection closed")
            data += part
        return data

    def call(self, method, params=None, session=None):
        self.sequence += 1
        command = {"id": self.sequence, "method": method, "params": params or {}}
        if session:
            command["sessionId"] = session
        payload = json.dumps(command).encode()
        mask = os.urandom(4)
        length = len(payload)
        head = bytes([0x81, 0x80 | length]) if length < 126 else bytes([0x81, 0xfe]) + struct.pack(">H", length) if length < 65536 else bytes([0x81, 0xff]) + struct.pack(">Q", length)
        self.sock.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))
        while True:
            first, second = self.read(2)
            size = second & 127
            if size == 126:
                size = struct.unpack(">H", self.read(2))[0]
            elif size == 127:
                size = struct.unpack(">Q", self.read(8))[0]
            masking = self.read(4) if second & 128 else None
            body = self.read(size)
            if masking:
                body = bytes(b ^ masking[i % 4] for i, b in enumerate(body))
            if first & 15 == 8:
                raise RuntimeError("CDP closed")
            if first & 15 != 1:
                continue
            message = json.loads(body)
            if message.get("id") == self.sequence:
                if "error" in message:
                    raise RuntimeError(message["error"])
                return message.get("result", {})

    def evaluate(self, source):
        result = self.call("Runtime.evaluate", {"expression": source, "returnByValue": True, "awaitPromise": True, "timeout": 20000})
        if "exceptionDetails" in result:
            raise RuntimeError(result["exceptionDetails"])
        return result.get("result", {}).get("value")

    def wait(self, expression):
        limit = time.monotonic() + 20
        while time.monotonic() < limit:
            if self.evaluate(expression):
                return
            time.sleep(.05)
        raise AssertionError("Timed out: " + expression)

    def close(self):
        self.sock.close()


class WorkerBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        candidates = [os.environ.get("CHROME_BIN", ""), r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", shutil.which("chromium"), shutil.which("google-chrome")]
        cls.binary = next((p for p in candidates if p and Path(p).is_file()), None)
        if not cls.binary:
            raise unittest.SkipTest("Chromium not installed; set CHROME_BIN")
        cls.profile = tempfile.TemporaryDirectory(prefix="seedonext-sw-qa-")
        cls.process = subprocess.Popen([cls.binary, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-extensions", "--disable-sync", "--host-resolver-rules=MAP static.cloudflareinsights.com ~NOTFOUND, MAP cloudflareinsights.com ~NOTFOUND, MAP pagead2.googlesyndication.com ~NOTFOUND", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--user-data-dir=" + cls.profile.name, "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        active = Path(cls.profile.name) / "DevToolsActivePort"
        limit = time.monotonic() + 20
        while not active.exists() and time.monotonic() < limit:
            time.sleep(.1)
        if not active.exists():
            cls.process.terminate()
            cls.process.wait(timeout=10)
            cls.profile.cleanup()
            raise RuntimeError("Headless browser did not start")
        port, endpoint = active.read_text().splitlines()[:2]
        cls.debug_port = int(port)
        cls.browser = CDP(f"ws://127.0.0.1:{port}{endpoint}")

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.process.terminate()
        cls.process.wait(timeout=10)
        # Let child browser processes release their isolated profile.
        for _ in range(30):
            try:
                cls.profile.cleanup()
                break
            except PermissionError:
                time.sleep(.1)

    def setUp(self):
        self.files, self.cache = builder.payload()
        self.legacy = (ROOT / "sw.js").read_bytes()
        self.redirect_index = True
        self.network_down = False
        owner = self
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if owner.network_down:
                    self.close_connection = True
                    try:
                        self.connection.shutdown(socket.SHUT_RDWR)
                    except OSError:
                        pass
                    self.connection.close()
                    return
                path = urlsplit(self.path).path
                for rule in owner.files.get("_redirects", b"").decode().splitlines():
                    fields = rule.split()
                    if len(fields) == 3 and fields[0] == path and fields[2] == "200":
                        path = fields[1]
                        break
                if path == "/qa.html":
                    data, kind = b"<!doctype html><title>Isolated QA</title>", "text/html"
                else:
                    if owner.redirect_index and path == "/app/index.html":
                        self.send_response(301)
                        self.send_header("Location", "/app/")
                        self.end_headers()
                        return
                    name = path.lstrip("/")
                    if not name:
                        name = "index.html"
                    elif name.endswith("/"):
                        name += "index.html"
                    data = owner.files.get(name)
                    if data is None:
                        self.send_error(404)
                        return
                    kind = "text/javascript" if name.endswith(".js") else "text/css" if name.endswith(".css") else "application/manifest+json" if name.endswith(".webmanifest") else "image/png" if name.endswith(".png") else "image/webp" if name.endswith(".webp") else "text/plain" if name.endswith(".txt") else "text/html"
                self.send_response(200)
                self.send_header("Content-Type", kind + "; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            def log_message(self, *args):
                pass
        class Server(http.server.ThreadingHTTPServer):
            def handle_error(self, request, address):
                if not isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError)):
                    super().handle_error(request, address)
        self.server = Server(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        target = self.browser.call("Target.createTarget", {"url": self.base + "/qa.html"})["targetId"]
        self.target = target
        with urllib.request.urlopen(f"http://127.0.0.1:{self.debug_port}/json/list") as r:
            page = next(p for p in json.load(r) if p["id"] == target)
        self.page = CDP(page["webSocketDebuggerUrl"])
        self.page.call("Page.enable")
        self.page.wait("document.readyState === 'complete'")

    def tearDown(self):
        self.page.close()
        self.browser.call("Target.closeTarget", {"targetId": self.target})
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def register(self, scope="/app/"):
        self.page.evaluate("""(async () => {
          const r = await navigator.serviceWorker.register(SCOPE + 'sw.js', {scope:SCOPE, updateViaCache:'none'});
          const end = Date.now() + 15000;
          while (r.active?.state !== 'activated') {
            if (Date.now() > end) throw Error('worker activation timeout');
            await new Promise(resolve => setTimeout(resolve, 25));
          }
          return r.scope;
        })()""".replace("SCOPE", json.dumps(scope)))

    def navigate(self, path):
        result = self.page.call("Page.navigate", {"url": self.base + path})
        self.assertNotIn("errorText", result, result)
        self.page.wait("document.readyState === 'complete' && location.pathname === " + json.dumps(urlsplit(path).path))
        self.assertTrue(self.page.evaluate("!!document.getElementById('openAddButton')"))

    def seed(self):
        self.page.evaluate("""localStorage.setItem('taskflowData', JSON.stringify({app:'TaskFlow',version:1,tasks:[{id:'keep',title:'QA sentinel',priority:'medium',size:'normal',progress:0,completed:false,note:'do not delete'}],dailyReviews:{}}))""")

    def test_legacy_redirect_response_reproduces_err_failed(self):
        self.files["app/sw.js"] = self.legacy
        self.register()
        redirected = self.page.evaluate("(async()=>{const c=await caches.open('taskflow-shell-v33');return (await c.match(location.origin+'/app/index.html')).redirected})()")
        self.assertTrue(redirected, "Cloudflare-style redirect was cached")
        result = self.page.call("Page.navigate", {"url": self.base + "/app/"})
        self.assertIn("ERR_FAILED", result.get("errorText", ""), result)

    def test_cloudflare_reload_reregister_and_offline(self):
        self.seed()
        self.register()
        self.register()
        self.navigate("/app/")
        self.navigate("/app/?reload=1")
        self.navigate("/app/index.html")
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks[0].note"), "do not delete")
        self.offline()
        self.navigate("/app/")
        self.assertTrue(self.page.evaluate("document.body.textContent.includes('QA sentinel')"))
        self.page.call("Network.emulateNetworkConditions", {"offline": False, "latency": 0, "downloadThroughput": -1, "uploadThroughput": -1})

    def test_github_pages_worker_unchanged_online_and_offline(self):
        self.redirect_index = False
        for name in builder.APP_FILES:
            self.files["TaskFlow/" + name] = (ROOT / name).read_bytes()
        self.seed()
        self.register("/TaskFlow/")
        self.navigate("/TaskFlow/")
        self.navigate("/TaskFlow/index.html")
        self.offline()
        self.navigate("/TaskFlow/")
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks[0].id"), "keep")

    def test_recovery_page_updates_legacy_worker_without_clearing_data(self):
        fixed = self.files["app/sw.js"]
        self.files["app/sw.js"] = self.legacy
        self.seed()
        self.register()
        result = self.page.call("Page.navigate", {"url": self.base + "/app/"})
        self.assertIn("ERR_FAILED", result.get("errorText", ""))
        self.files["app/sw.js"] = fixed
        result = self.page.call("Page.navigate", {"url": self.base + "/recovery/"})
        self.assertNotIn("errorText", result)
        self.page.wait("document.readyState === 'complete' && !!document.getElementById('repairWorker')")
        self.page.evaluate("document.getElementById('repairWorker').click()")
        self.page.wait("document.getElementById('repairStatus').dataset.state === 'ready'")
        self.navigate("/app/")
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks[0].note"), "do not delete")

    def offline(self):
        # CDP page offline mode alone does not block a separate worker target.
        # Also drop server connections so worker network fetches truly fail.
        self.network_down = True
        self.page.call("Network.enable")
        self.page.call("Network.emulateNetworkConditions", {"offline": True, "latency": 0, "downloadThroughput": 0, "uploadThroughput": 0})

    def test_missing_cache_online_is_rebuilt_for_offline(self):
        self.seed()
        self.register()
        self.page.evaluate("(async()=>{for(const key of await caches.keys()) await caches.delete(key)})()")
        self.navigate("/app/")
        self.offline()
        self.navigate("/app/")
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks[0].id"), "keep")

    def test_missing_cache_offline_has_explanation_not_err_failed(self):
        self.seed()
        self.register()
        self.page.evaluate("(async()=>{for(const key of await caches.keys()) await caches.delete(key)})()")
        self.offline()
        result = self.page.call("Page.navigate", {"url": self.base + "/app/"})
        self.assertNotIn("errorText", result)
        self.page.wait("document.readyState === 'complete' && !!document.querySelector('a[href=\"/recovery/\"]')")
        self.assertEqual(self.page.evaluate("document.title"), "SeeDonext \u2014 \u30aa\u30d5\u30e9\u30a4\u30f3")
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks[0].id"), "keep")

    def test_redirected_html_cache_response_is_normalized(self):
        self.seed()
        self.register()
        self.assertTrue(self.page.evaluate("(async()=>{const r=await fetch('/app/index.html');const redirected=r.redirected;await (await caches.open(" + json.dumps(self.cache) + ")).put(location.origin+'/app/',r);return redirected})()"))
        self.navigate("/app/")
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks[0].id"), "keep")

    def test_cache_api_failure_falls_back_to_network(self):
        self.seed()
        self.register()
        target = next(t for t in self.browser.call("Target.getTargets")["targetInfos"] if t["type"] == "service_worker" and t["url"] == self.base + "/app/sw.js")
        session = self.browser.call("Target.attachToTarget", {"targetId": target["targetId"], "flatten": True})["sessionId"]
        self.browser.call("Runtime.evaluate", {"expression": "self.caches.open = async () => { throw Error('simulated cache failure'); }"}, session)
        self.navigate("/app/")
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks[0].id"), "keep")

    def test_update_waits_for_user_and_recovery_activates_waiting_worker(self):
        fixed = self.files["app/sw.js"]
        self.files["app/sw.js"] = self.legacy
        self.seed()
        self.navigate("/app/")  # First document loads before the old worker claims it.
        self.page.wait("!!navigator.serviceWorker.controller")
        self.files["app/sw.js"] = fixed
        self.page.evaluate("(async()=>{const r=await navigator.serviceWorker.getRegistration('/app/');await r.update();return true})()")
        self.page.wait("(async()=>!!(await navigator.serviceWorker.getRegistration('/app/')).waiting)()")
        target = self.browser.call("Target.createTarget", {"url": self.base + "/recovery/"})["targetId"]
        repair = None
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{self.debug_port}/json/list") as response:
                info = next(p for p in json.load(response) if p["id"] == target)
            repair = CDP(info["webSocketDebuggerUrl"])
            repair.wait("document.readyState === 'complete' && !!document.getElementById('repairWorker')")
            repair.evaluate("document.getElementById('repairWorker').click()")
            repair.wait("document.getElementById('repairStatus').dataset.state === 'ready'")
            self.page.wait("(async()=>!(await navigator.serviceWorker.getRegistration('/app/')).waiting)()")
            self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks[0].id"), "keep")
            self.navigate("/app/")
        finally:
            if repair:
                repair.close()
            self.browser.call("Target.closeTarget", {"targetId": target})

    def test_failed_worker_install_preserves_data_and_reports_error(self):
        fixed = self.files["app/sw.js"]
        self.files["app/sw.js"] = self.legacy
        self.seed()
        self.register()
        self.files["app/sw.js"] = fixed
        del self.files["app/icons/icon-512.png"]  # Force cache.addAll to fail.
        result = self.page.call("Page.navigate", {"url": self.base + "/recovery/"})
        self.assertNotIn("errorText", result)
        self.page.wait("document.readyState === 'complete' && !!document.getElementById('repairWorker')")
        self.page.evaluate("document.getElementById('repairWorker').click()")
        self.page.wait("document.getElementById('repairStatus').dataset.state === 'error'")
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks[0].id"), "keep")
        self.assertTrue(self.page.evaluate("(async()=>!!(await navigator.serviceWorker.getRegistration('/app/')).active)()"))

    def test_analytics_tag_is_once_on_each_generated_page(self):
        for path in ["/", "/app/", "/migration/", "/recovery/"]:
            result = self.page.call("Page.navigate", {"url": self.base + path})
            self.assertNotIn("errorText", result)
            self.page.wait("document.readyState === 'complete' && location.pathname === " + json.dumps(path))
            tags = self.page.evaluate("""Array.from(document.querySelectorAll('script[data-cf-beacon]')).map(s => ({src:s.src,type:s.type,config:JSON.parse(s.getAttribute('data-cf-beacon'))}))""")
            self.assertEqual(tags, [{"src": builder.ANALYTICS_SRC, "type": "module", "config": {"token": builder.ANALYTICS_TOKEN}}], path)

    def test_analytics_blocked_does_not_prevent_task_save_or_pwa(self):
        self.seed()
        self.navigate("/app/")
        self.page.wait("!!navigator.serviceWorker.controller")
        self.page.evaluate("""document.getElementById('openAddButton').click();
          const field=document.getElementById('taskInput');
          field.value='Saved while analytics is blocked';
          field.dispatchEvent(new Event('input',{bubbles:true}));
          document.getElementById('addButton').click();""")
        tasks = self.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks")
        self.assertEqual(len(tasks), 2)
        self.assertEqual(tasks[0]["note"], "do not delete")
        self.assertEqual(tasks[1]["title"], "Saved while analytics is blocked")
        self.offline()
        self.navigate("/app/")
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks.length"), 2)

    def test_adsense_is_once_in_head_without_ad_units_on_all_pages(self):
        for path in ["/", "/app/", "/migration/", "/recovery/"]:
            result = self.page.call("Page.navigate", {"url": self.base + path})
            self.assertNotIn("errorText", result)
            self.page.wait("document.readyState === 'complete' && location.pathname === " + json.dumps(path))
            tags = self.page.evaluate("""Array.from(document.querySelectorAll('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')).map(s=>({src:s.src,async:s.async,crossOrigin:s.crossOrigin,inHead:document.head.contains(s)}))""")
            self.assertEqual(tags, [{"src": builder.ADSENSE_SCRIPT + "?client=" + builder.ADSENSE_CLIENT, "async": True, "crossOrigin": "anonymous", "inHead": True}], path)
            self.assertEqual(self.page.evaluate("document.querySelectorAll('script[data-cf-beacon]').length"), 1)
            self.assertEqual(self.page.evaluate("document.querySelectorAll('ins.adsbygoogle').length"), 0)

    def test_landing_screenshots_load_without_overflow_at_phone_tablet_and_desktop_widths(self):
        for width in [360, 390, 768, 1280]:
            self.page.call("Emulation.setDeviceMetricsOverride", {"width":width,"height":900,"deviceScaleFactor":1,"mobile":width < 600})
            result = self.page.call("Page.navigate", {"url": self.base + "/"})
            self.assertNotIn("errorText", result)
            self.page.wait("document.readyState === 'complete'")
            self.page.evaluate("document.querySelectorAll('.app-screenshot').forEach(image=>image.scrollIntoView());document.getElementById('screen-title').scrollIntoView()")
            self.page.wait("Array.from(document.querySelectorAll('.app-screenshot')).length===2 && Array.from(document.querySelectorAll('.app-screenshot')).every(i=>i.complete && i.naturalWidth>0)")
            images = self.page.evaluate("""Array.from(document.querySelectorAll('.app-screenshot')).map(i=>({alt:i.alt,actual:[i.naturalWidth,i.naturalHeight],declared:[Number(i.getAttribute('width')),Number(i.getAttribute('height'))],fits:i.getBoundingClientRect().left>=0 && i.getBoundingClientRect().right<=innerWidth}))""")
            for image in images:
                self.assertEqual(image["actual"], image["declared"], width)
                self.assertTrue(image["fits"], width)
                self.assertGreater(len(image["alt"]), 20)
            self.assertTrue(self.page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width)
            self.assertEqual(self.page.evaluate("document.querySelectorAll('script[data-cf-beacon]').length"), 1)
            self.assertEqual(self.page.evaluate("document.head.querySelectorAll('script[src*=googlesyndication]').length"), 1)

    def test_privacy_page_is_linked_and_readable_on_phone_and_desktop(self):
        result = self.page.call("Page.navigate", {"url": self.base + "/"})
        self.assertNotIn("errorText", result)
        self.page.wait("document.readyState==='complete' && !!document.querySelector('footer a[href=\"./privacy/\"]')")
        self.assertEqual(self.page.evaluate("document.querySelector('footer a[href^=mailto]').getAttribute('href')"), "mailto:seedonextsupport@gmail.com")
        self.page.evaluate("document.querySelector('footer a[href=\"./privacy/\"]').click()")
        self.page.wait("document.readyState==='complete' && location.pathname==='/privacy/'")
        for width in [360, 768, 1280]:
            self.page.call("Emulation.setDeviceMetricsOverride", {"width":width,"height":900,"deviceScaleFactor":1,"mobile":width<600})
            self.assertTrue(self.page.evaluate("document.documentElement.scrollWidth<=innerWidth"), width)
            self.assertGreaterEqual(self.page.evaluate("parseFloat(getComputedStyle(document.body).fontSize)"), 16)
            self.assertTrue(self.page.evaluate("document.getElementById('main').getBoundingClientRect().left>=16 && document.getElementById('main').getBoundingClientRect().right<=innerWidth-16"), width)
        self.assertEqual(self.page.evaluate("document.querySelector('time').getAttribute('datetime')"), "2026-11-04")
        self.assertEqual(self.page.evaluate("document.querySelectorAll('script[data-cf-beacon],script[src*=googlesyndication]').length"), 0)
        self.assertEqual(self.page.evaluate("document.getElementById('contact').parentElement.querySelector('a[href^=mailto]').getAttribute('href')"), "mailto:seedonextsupport@gmail.com")

    def test_app_policy_opens_new_tab_without_losing_tasks_or_input(self):
        self.seed()
        self.navigate("/app/")
        self.page.evaluate("document.getElementById('openAddButton').click();document.getElementById('taskInput').value='Unsaved QA draft';document.getElementById('cancelAddButton').click();document.getElementById('menuButton').click()")
        before = self.page.evaluate("localStorage.getItem('taskflowData')")
        self.page.call("Runtime.evaluate", {"expression":"document.getElementById('cloudflarePrivacyPolicyLink').click()", "userGesture":True})
        target = None
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline and target is None:
            target = next((t for t in self.browser.call("Target.getTargets")["targetInfos"] if t["type"]=="page" and t["url"]==self.base+"/privacy/"), None)
            if target is None:
                time.sleep(.05)
        self.assertIsNotNone(target, "Policy should open in a separate tab")
        try:
            self.assertEqual(self.page.evaluate("localStorage.getItem('taskflowData')"), before)
            self.assertEqual(self.page.evaluate("document.getElementById('taskInput').value"), "Unsaved QA draft")
            self.assertEqual(self.page.evaluate("document.getElementById('cloudflarePrivacyPolicyLink').rel"), "noopener")
        finally:
            if target:
                self.browser.call("Target.closeTarget", {"targetId":target["targetId"]})

    def test_search_console_exact_url_returns_original_without_redirect(self):
        self.register()
        name = builder.SEARCH_CONSOLE_FILE
        url = self.base + "/" + name
        with urllib.request.urlopen(url) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.geturl(), url)
            self.assertIsNone(response.headers.get("Location"))
            self.assertEqual(response.read(), (ROOT / name).read_bytes())
        result = self.page.call("Page.navigate", {"url": url})
        self.assertNotIn("errorText", result)
        self.page.wait("document.readyState==='complete' && location.pathname===" + json.dumps("/" + name))
        self.assertEqual(self.page.evaluate("document.body.innerText.trim()"), (ROOT / name).read_text(encoding="utf-8").strip())


if __name__ == "__main__":
    unittest.main(verbosity=2)
