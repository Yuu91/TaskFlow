"""Capture actual local app UI with demo data, never a user's browser profile.
Run: python -B scripts/capture_landing_screenshots.py
Requires Chrome/Edge (or CHROME_BIN) and the standard-library browser test helper.
Only writes the two named WebP assets under landing/assets/.
"""
import base64
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("landing_capture_browser", ROOT / "tests/service_worker_browser_test.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
Case = helper.WorkerBrowserTests


def capture():
    Case.setUpClass()
    case = Case("test_cloudflare_reload_reregister_and_offline")
    started = False
    try:
        case.setUp()
        started = True
        case.page.evaluate("""(() => {
          const day = offset => { const d = new Date(); d.setDate(d.getDate()+offset); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
          const task = (id,title,category,priority,size,progress,deadline,plannedDate) => ({id,title,category,priority,size,progress,deadline,plannedDate,parentId:null,completed:false,completedAt:null,note:''});
          const tasks = [
            task('demo-reading','読書ノートをまとめる','学習','high','normal',25,day(2),day(0)),
            task('demo-english','英語を15分復習する','学習','medium','short',50,'',day(0)),
            task('demo-shopping','週末の買い物リストを作る','生活','low','short',0,day(4),day(2)),
            task('demo-desk','机のまわりを片付ける','生活','medium','short',0,'',null)
          ];
          localStorage.setItem('taskflowData',JSON.stringify({app:'TaskFlow',version:1,tasks,dailyReviews:{}}));
          localStorage.setItem('taskflowInstallHintDismissed','1');
        })()""")
        case.page.call("Emulation.setDeviceMetricsOverride", {"width":1280,"height":1040,"deviceScaleFactor":1,"mobile":False})
        case.navigate("/app/")
        case.page.wait("!!navigator.serviceWorker.controller")
        case.page.evaluate("(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()")
        assets = ROOT / "landing/assets"
        desktop = case.page.call("Page.captureScreenshot", {"format":"webp","quality":88,"captureBeyondViewport":False,"fromSurface":True})["data"]
        (assets / "app-home-desktop.webp").write_bytes(base64.b64decode(desktop))
        case.page.call("Emulation.setDeviceMetricsOverride", {"width":390,"height":844,"deviceScaleFactor":2,"mobile":True})
        case.page.call("Emulation.setTouchEmulationEnabled", {"enabled":True,"maxTouchPoints":1})
        case.page.evaluate("document.querySelector('.bottom-nav [data-screen=\"all\"]').click();document.getElementById('allTasksList').scrollIntoView({block:'start'})")
        case.page.evaluate("(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()")
        mobile = case.page.call("Page.captureScreenshot", {"format":"webp","quality":88,"captureBeyondViewport":False,"fromSurface":True})["data"]
        (assets / "app-tasks-mobile.webp").write_bytes(base64.b64decode(mobile))
        # Verify the only task data in this isolated profile is the four demo tasks.
        ids = case.page.evaluate("JSON.parse(localStorage.getItem('taskflowData')).tasks.map(t=>t.id)")
        assert len(ids) == 4 and all(item.startswith("demo-") for item in ids), ids
        print("Captured real app demo screens: desktop 1280x1040, mobile 780x1688")
    finally:
        if started:
            case.tearDown()
        Case.tearDownClass()


if __name__ == "__main__":
    capture()
