# Cloudflare Pages向け公開ファイル

既存のGitHub Pagesアプリはリポジトリ直下のまま維持します。生成物だけが `/` 紹介ページ、`/app/` アプリ、`/migration/` 移行案内の構成になります。公開・Git pushは別途判断してください。

## 生成とローカル確認

Python 3.9以降の標準ライブラリだけを使用します。リポジトリ直下で実行します。

```powershell
python -B scripts/build_cloudflare.py
python -B tests/cloudflare_build_test.py
python -m http.server 8080 --directory dist-cloudflare
```

ブラウザで `http://localhost:8080/` を開きます。終了はCtrl+C。Node.jsがある環境では既存テストも実行します。

```powershell
node tests/recommendation.test.cjs
node tests/app-features.test.cjs
```

生成先は `dist-cloudflare/` 固定で、引数による変更はできません。元ソースを書き換えず、削除処理も実行しません。出力先および入力のリンク・ジャンクション等を拒否します。出力先に今回生成しないファイルがあると停止します。素材の削除・改名で停止した場合は、まず生成先の内容とパスを確認し、不要な生成ファイルだけ手動で除いて再生成してください。並行して別プロセスから出力先を操作しないでください。

コピー対象は明示したアプリファイル、紹介・移行・接続修復ページと対応画像のみです。テスト・Gitメタデータ・移行データ・設定ファイルは公開用にコピーしません。

## PWAの差分と更新

GitHub Pages用の元manifestとService Workerは変更しません。Cloudflare生成物には専用Service Workerテンプレートを使用し、以下を調整します。

- manifest: `id: "/app/"`, `scope: "./"`, `start_url: "./"`
- Service Worker: `seedonext-cloudflare-shell-v{cacheVersion}-{アプリ内容のSHA-256先頭16桁}`

`cloudflare-build.json`の`cacheVersion`は正の整数です。リリース管理上の区切りで増やします。アプリ・manifest・Service Workerの内容が変わるとハッシュも変わるため、番号の更新漏れでも古いキャッシュを使い回しません。紹介ページだけの変更はアプリのキャッシュ名に影響しません。

登録は既存の `./sw.js` を利用し、`/app/` 内に限定します。ルートにworkerやmanifestは置きません。紹介ページはオフライン保証対象外です。更新は既存の利用者操作による適用を維持します。旧キャッシュを自動削除しない既存方式も維持するため、長期運用時の容量増加は残る課題です。アクセス障害への対策と復旧手順は下記を参照してください。

## 公開前チェック

- `seedonext.pages.dev`の利用可否と最終URLを管理画面で確認。未取得のURLを利用者向け移行先として告知しない。
- 正式なプライバシーポリシー・利用規約・問い合わせ先を用意。現在の「準備中」は公開用の完成情報ではありません。
- `landing/assets/README.md`に従い、個人情報を含まない実画面を追加。
- Cloudflareの公開対象は `dist-cloudflare/` の内容のみ。リポジトリ直下をアップロードしない。初回は手動アップロードを想定し、自動デプロイは設定していません。
- GitHub Pagesの公開ブランチ・フォルダー設定は維持。実設定は管理画面で確認。旧サイトの自動転送・停止は行わない。
- PC・スマホで文字、横スクロール、キーボード操作、リンクを確認。
- 最終オリジンの `/app/` で保存・再読み込み、旧JSONの復元と再出力、インストール後のデータ、オンライン・オフライン起動、更新通知・適用を確認。`/app/index.html` のCloudflareによる `/app/` へのリダイレクトとキャッシュ初回作成も確認。
- 復元は全置換。既存データは先に保存・バックアップ。プレビューURLと本番URLは保存先が異なるため、プレビューでの復元は本番移行になりません。
- 旧サイトへの移行案内は、最終URL・復元・PWA検証後の別作業。今回、旧HTMLや旧キャッシュのバージョンは更新していません。

## 移行・復旧

利用者向け手順は `landing/migration/index.html` にあります。旧環境で保存→JSONの実ファイルを保管→新環境で復元→再読み込み・内容確認→新PWAからも確認、の順です。両方を編集しても同期・統合されません。

復元前退避はブラウザ内であり、外部バックアップの代わりにはなりません。旧サイトのデータと控えを残してください。新環境の問題が見つかった場合は旧サイトを引き続き利用できますが、新環境で追加したデータは旧環境へ自動反映されません。両環境のバックアップを保管し、復元による全置換に注意してください。

## ERR_FAILEDの原因と修正版（2026-11-04）

Cloudflare Pagesは通常、/app/index.htmlを/app/へ転送します。旧workerは転送後のResponseをindex.htmlのキーで保存し、ナビゲーションへそのまま返していました。Chromeのナビゲーションはredirectがmanualなので、転送履歴付きの応答はネットワークエラー（ERR_FAILED）になります。ローカルの同じ転送と実Chromeで再現しました。公開環境の応答は調査環境では403となり、配信済みworkerそのものの照合は未確認です。

Cloudflare専用テンプレート scripts/cloudflare-sw.js を生成時に使用します。GitHub Pages用の直下のsw.js・pwa.js・manifest・保存キー・JSON形式は変更しません。

- HTMLはindex.htmlではなく/app/を直接取得してキャッシュします。index.htmlからのアクセスも同じキャッシュへ対応します。
- 念のため転送履歴のあるHTML応答を再構成してから返します。
- キャッシュの読み取り・保存失敗では、オンラインのネットワーク応答を妨げません。
- キャッシュがなく通信もできない場合は、ERR_FAILEDではなく説明付きの503画面を返します。データ削除はしません。
- 新しいworker内容を含むハッシュでキャッシュ名を更新します。古いキャッシュやlocalStorageは削除しません。

### 再デプロイ

1. プロジェクト直下で次を実行します。
   python -B tests/cloudflare_build_test.py
   python -B tests/service_worker_browser_test.py
   python -B scripts/build_cloudflare.py
2. Cloudflareの既存seedonextプロジェクトで、新しい本番デプロイとしてdist-cloudflare/の中身をアップロードします。リポジトリ直下をアップロードしないでください。Git連携の場合はビルドコマンドをpython -B scripts/build_cloudflare.py、出力先をdist-cloudflareにします。
3. /app/sw.jsの先頭がseedonext-cloudflare-shell-v2-で始まる新しいキャッシュ名で、HTML取得先が"./"であることを確認します。/recovery/も開くことを確認します。
4. 壊れた旧workerが残るブラウザーでは、同じ通常プロファイルで https://seedonext.pages.dev/recovery/ を開き、「プログラムを更新する」を押します。ここは/app/のスコープ外です。更新完了後「アプリを開く」へ進みます。
5. タスクとメモを確認して再読み込みし、オンライン・機内モードの両方を確認します。DevToolsの「Bypass for network」は確認時にオフへ戻します。

「サイトデータを消去」「ストレージを消去」は実行しないでください。Unregisterを繰り返しても旧ファイルが配信されたままなら再発します。公開先が同じであれば、修復ページは登録の更新とACTIVATE_UPDATEだけを行い、タスクデータの読み取り・初期化・削除を行いません。

### 回帰確認の範囲

ブラウザーテストは標準ライブラリとヘッドレスChrome/Edgeを使い、専用の一時プロファイルで実行します。普段のChromeや本番タスクには接続しません。ブラウザーが未検出の場合は未実施（SKIP）になります。必要ならCHROME_BINでブラウザーの実行ファイルを指定してください。

Cloudflare形式の転送で旧workerのERR_FAILEDを再現し、修正版の再登録・繰り返し表示・オフライン起動・旧workerからの更新とデータ維持、およびGitHub Pages形式の従来workerを確認します。実Cloudflareへの再デプロイ、本番Chromeプロファイル、iPhone・Android実機は別途確認が必要です。

## Cloudflare Web Analytics（手動埋め込み）

生成物の /・/app/・/migration/・/recovery/ に、指定トークンのmoduleスニペットを1個ずつ追加します。404ページとGitHub Pages用の元HTMLには追加しません。設定は scripts/build_cloudflare.py の ANALYTICS_TOKEN・ANALYTICS_PAGES にあります。トークンは公開HTMLに含めるサイト識別子です。

ビルド処理は同じ有効なスニペットが既にある場合は再挿入しません。重複や異なるトークンを検出すると、重複計測を防ぐため生成前に停止します。Cloudflare側の自動挿入はビルドでは制御できないため、同じサイトで手動埋め込みと自動挿入を併用しない設定を管理画面で確認してください。今回、管理画面の設定変更やデプロイは行いません。

### 計測の範囲とデータ

ページ別の閲覧・訪問の傾向、参照元、ブラウザー等の情報、表示速度・Web VitalsをCloudflare Web Analyticsで確認します。タスク名・メモ・分類・入力欄・localStorage・バックアップJSONを計測データとして渡す処理は追加しません。個人のタスク内容や作業進捗を分析する機能ではありません。

アプリ内の「ホーム・タスク一覧・バックアップ」はURLを変えずに表示を切り替えるため、各タブ操作や追加・完了ボタンの回数は個別に計測しません。独自イベントは追加していません。ページ閲覧と利用者の実人数は必ずしも一致しません。

オフライン、広告ブロック、通信失敗などでは計測できないことがあります。オフライン中のアクセスを後から送る独自キューはありません。解析スクリプトはService Workerのキャッシュやインストール必須ファイルには追加しません。アプリHTMLの変化は既存の内容ハッシュに含まれ、PWA更新後に計測タグが反映されます。

### 確認

python -B tests/cloudflare_build_test.py
python -B tests/service_worker_browser_test.py
python -B scripts/build_cloudflare.py

ブラウザーテストではCloudflareの解析先をDNSで遮断し、テストアクセスが本番の統計に送られないようにします。生成HTMLのタグ・トークン・重複防止、解析が使えない状態での保存・PWA更新・オフライン動作を確認します。本物のbeacon実行・送信内容のネットワーク検査・本番ダッシュボードへの反映は、デプロイ後の確認事項です。

再デプロイ時は dist-cloudflare/ の中身だけを既存Pagesプロジェクトへアップロードしてください。反映後は /・/app/・/migration/・/recovery/ のHTMLでbeaconが1個であること、Networkでbeacon.min.jsが取得でき、計測のPOSTが送られることを確認します。Web Analyticsは反映まで数分かかる場合があります。

公式資料:
https://developers.cloudflare.com/web-analytics/get-started/
https://developers.cloudflare.com/web-analytics/faq/
https://developers.cloudflare.com/speed/observatory/rum-beacon/

## AdSenseサイト所有権確認コード

Cloudflare生成物の /・/app/・/migration/・/recovery/ のhead内に、指定のasyncスクリプト（client: ca-pub-8268684254916846、crossorigin: anonymous）を1個ずつ設置します。設定は scripts/build_cloudflare.py の ADSENSE_CLIENT・ADSENSE_PAGES にあります。再ビルドしても残り、同じ有効なコードの再挿入は行いません。重複・異なるpublisher・head外の既存コードはビルドエラーになります。

Cloudflare Web Analyticsは従来どおり各ページ1個を維持します。404、元のGitHub Pages用HTML、Service Workerの必須キャッシュにはAdSenseコードを追加しません。保存キー・バックアップ形式・タスク操作・Worker本体は変更しません。アプリHTMLの変更で生成キャッシュのハッシュは更新されます。

広告枠（ins.adsbygoogle）、adsbygoogle.push、独自の自動広告有効化コードは追加しません。Google管理画面の設定は変更していません。このスクリプト自体はAdSenseの各機能で共通に使われるため、広告表示をまだ開始しない場合はAdSense管理画面でも対象サイトの自動広告をOFFにしてください。審査や所有権確認の成功は未確認です。

### 再デプロイ・審査申請の確認

1. python -B tests/cloudflare_build_test.py と python -B tests/service_worker_browser_test.py を実行します。
2. python -B scripts/build_cloudflare.py で再生成します。
3. Cloudflare Pagesの既存seedonextプロジェクトへ dist-cloudflare/ の中身を本番デプロイします。リポジトリ直下はアップロードしません。
4. 本番4ページのHTMLソースでhead内のAdSenseコードが1個、Analyticsも1個であることを確認します。古いPWAは更新を適用してください。
5. AdSenseでseedonext.pages.devの接続確認・審査申請を進めます。自動広告はOFFのままにします。

今回の作業ではデプロイや審査申請は行いません。テスト用ChromeはGoogleとCloudflareの外部スクリプト先をDNS遮断し、実広告・本番計測を発生させずにDOM・保存・オフラインを検証します。本物のGoogleスクリプトの取得、Google側の設定・認識、審査結果、スマホ実機はデプロイ後の確認事項です。

公式資料:
https://support.google.com/adsense/answer/7584263
https://support.google.com/adsense/answer/9274634
https://support.google.com/adsense/answer/9261307

## プライバシーポリシー（最終更新：2026-11-04）

landing/privacy/index.html を /privacy/ として生成します。紹介ページのフッターとCloudflare生成アプリの☰メニュー・「データの保存について」にリンクします。アプリ側は新しいタブで開き、入力途中の画面を維持します。元のGitHub Pages用HTMLは変更しません。ポリシーは/app/のWorkerスコープ外で、オフライン閲覧の保証対象ではありません。新しい解析・広告タグもこのページには追加しません。

### 確認した事実

- タスク・振り返り・案内設定・復元前退避はlocalStorage。入力途中はsessionStorage。旧版保存キーも読み込みます。
- 独自コードにCookie設定処理やタスク本文・JSONをアップロードする処理はありません。
- バックアップは暗号化されないJSON。共有・コピーを利用者が選ぶと選択先へ内容が渡る可能性があります。
- Cloudflare配信、解析、Google AdSenseのコードによる通信があるため、サイト全体を「Cookieなし」「外部通信なし」とは説明しません。
- 広告枠・自動広告の有効化・CMPの設定は今回追加していません。

### 公開前に運営者が設定・確認する事項

1. 公式問い合わせ先 seedonextsupport@gmail.com をポリシーのcontact節と紹介ページにmailtoリンクで設定済み。実際の送受信、受信メールの管理・保管期間、必要な運営者の公開表記は別途確認する。テストメールの送信はしていない。
2. Google管理画面の自動広告・パーソナライズ・第三者配信事業者、実際のCookieを確認し、必要なリンク・説明を更新する。
3. 対象地域と広告配信方式に応じてGoogle認定CMP・同意取得等の要件を確認する。ポリシーの掲載だけで同意を得たことにはならない。
4. Cloudflare側の解析自動挿入、配信ログの保存期間、保護機能の設定を確認する。管理画面へは接続していない。
5. デプロイ後に /privacy/ と紹介ページ・アプリからのリンクをスマホ実機でも確認する。Google審査の合格や法令適合を保証するものではない。

Google公式の確認資料:
https://support.google.com/adsense/answer/1348695?hl=ja
https://support.google.com/adsense/answer/7549925?hl=ja
https://policies.google.com/technologies/partner-sites?hl=ja
https://policies.google.com/technologies/ads?hl=ja
https://support.google.com/adsense/answer/13554116?hl=ja

既存と同じコマンドでテスト・ビルドします。アプリHTMLのメニューリンク追加で内容ハッシュは変わりますが、Worker本体・キャッシュ戦略・保存形式は変更しません。

公式問い合わせ先の追記（2026-11-04）：サービス概要と、問い合わせメールの返信・内容確認への利用、Gmail受信についてポリシーへ追記。アプリからは既存のポリシーリンク経由で問い合わせ先を参照できる。/privacy/はWorkerの/app/スコープ外のためオンライン閲覧を維持し、Workerやキャッシュ戦略は変更しない。デプロイ時は既存プロジェクトへdist-cloudflare/の中身をアップロードし、/privacy/とフッターのmailto宛先を確認する。
