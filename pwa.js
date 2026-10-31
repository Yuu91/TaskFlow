(() => {
  const status = document.getElementById("pwaStatus");
  const button = document.getElementById("pwaUpdate");
  if (!window.isSecureContext || !("serviceWorker" in navigator)) {
    status.textContent = "オフライン利用にはHTTPSの公開URLが必要です。この接続では通常のWeb画面として利用できます。";
    return;
  }
  let registration;
  let reloadRequested = false;
  let updateAvailable = false;
  let controllerChanged = false;
  let hadController = Boolean(navigator.serviceWorker.controller);
  function showStatus() {
    document.querySelector(".pwa-status").setAttribute("data-state",
      updateAvailable || controllerChanged ? "update" : registration?.active ? "ready" : "preparing");
    button.hidden = !updateAvailable && !controllerChanged;
    button.textContent = controllerChanged ? "新しい版を開く" : "更新する";
    status.textContent = updateAvailable || controllerChanged
      ? "新しいバージョンがあります。入力内容を保存してから更新してください。"
      : registration?.active
        ? (navigator.onLine ? "オフライン利用可能" : "オフラインで利用中・端末内に保存")
        : "オフライン起動の準備中です。通信を切らずにお待ちください。";
  }
  // 他のタブで更新されても、この画面を勝手に再読み込みしない。
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadRequested) { window.location.reload(); return; }
    if (hadController) {
      controllerChanged = true;
    }
    hadController = true;
    showStatus();
  });
  button.addEventListener("click", () => {
    if (!confirm("画面を再読み込みします。保存していないタスクやメモの入力は失われます。保存済みデータは残ります。更新しますか？")) return;
    if (registration?.waiting) {
      reloadRequested = true;
      button.disabled = true;
      registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
    } else window.location.reload();
  });
  window.addEventListener("online", showStatus);
  window.addEventListener("offline", showStatus);
  window.addEventListener("load", async () => {
    try {
      registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      function checkWaiting() {
        updateAvailable = Boolean(registration.waiting);
        showStatus();
      }
      checkWaiting();
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed") checkWaiting();
          if (installing.state === "activated") {
            checkWaiting();
          }
          if (installing.state === "redundant") {
            document.querySelector(".pwa-status").setAttribute("data-state", "error");
            status.textContent = "オフライン用ファイルの取得に失敗しました。通信を確認して再読み込みしてください。";
          }
        });
      });
      await navigator.serviceWorker.ready;
      showStatus();
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && navigator.onLine) registration.update().catch(() => {});
      });
    } catch (error) {
      document.querySelector(".pwa-status").setAttribute("data-state", "error");
      status.textContent = "オフライン利用の準備ができませんでした。通信とHTTPSの公開設定を確認して再読み込みしてください。";
    }
  });
})();
