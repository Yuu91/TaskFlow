# 公開用の実画面

- app-home-desktop.webp：実アプリのホーム。1280×1040px。
- app-tasks-mobile.webp：実アプリのタスク一覧をスマートフォン幅で撮影。780×1688px（390×844 CSS px、倍率2）。
- 画像生成AIや架空のUIは使用していません。ローカルのSeeDonextを実Chromeで実行し、専用の一時プロファイルにサンプルデータを登録して撮影しています。
- サンプルは「読書ノートをまとめる」「英語を15分復習する」「週末の買い物リストを作る」「机のまわりを片付ける」の4件です。利用者の実データ・氏名・連絡先・通知・他アプリの画面は含みません。撮影時に各画像を目視確認します。
- 添付された元のスクリーンショットや通常のブラウザープロファイルは変更・使用していません。

## 再撮影

Chrome/EdgeとPython標準ライブラリで実行できます。必要ならCHROME_BINを設定します。

    python -B scripts/capture_landing_screenshots.py

このスクリプトは tests/service_worker_browser_test.py の隔離ブラウザー用ヘルパーを使い、上記2画像だけを書き出します。PC画面とスマホ幅の画面を実アプリから撮影し、Google/Cloudflareの外部スクリプト通信は遮断します。日付は撮影日のアプリ表示です。実際のスマートフォンOSの撮影ではありません。

画像はWebPで保存し、元の縦横比を維持します。landing/index.htmlにはwidth・height、画面内容を説明するalt、loading="lazy"・decoding="async"を指定しています。PCでは2枚を並べ、狭い画面では縦に配置します。拡大リンクから元解像度で確認できます。

## 確認・ビルド

    python -B tests/cloudflare_build_test.py
    python -B tests/service_worker_browser_test.py
    python -B scripts/build_cloudflare.py

生成物は dist-cloudflare/assets/ にコピーされます。元のアプリ、GitHub Pages用HTML、保存データは変更しません。このREADMEと撮影スクリプト自体は公開用にコピーしません。
