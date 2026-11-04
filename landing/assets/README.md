# 実画面の追加

スクリーンショットは未提供のため、公開用画像は含めていません。

1. テスト用データで実際のSeeDonextを撮影し、個人情報・通知・他アプリの情報が入っていないか確認します。
2. `landing/assets/app-home.webp`などに保存します。対応形式は `.webp`、`.png`、`.jpg`、`.jpeg`、`.avif` です。
3. `landing/index.html`の `.screenshot-placeholder` 全体を、例えば次に置き換えます。幅・高さ・altは実際の画像に合わせます。

```html
<img src="./assets/app-home.webp" width="1200" height="800"
     loading="lazy" decoding="async"
     alt="今日のタスクと締切の見通しを表示したSeeDonextのホーム画面">
```

4. キャプションも画像に合わせ、生成し直します。実在しない機能を描いた画像は使用しません。

このREADME自体は公開先へコピーされません。
