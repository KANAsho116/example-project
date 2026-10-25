# 開発への参加

## はじめかた

```sh
git clone https://github.com/KANAsho116/example-project.git
cd example-project
git switch -c feature/変更内容
python -m http.server 8000
```

ブラウザーで `http://localhost:8000` を開いて動作を見ます。ビルドやパッケージのインストールは不要です。

## 2人で進める流れ

1. まずGitHub Issuesに作業内容を書き、担当する人を決めます。
2. 作業ごとに `feature/...` ブランチを作ります。`main` には直接コミットしません。
3. 小さな変更に分けてコミットし、ブランチをpushしてPull Requestを作ります。
4. もう1人が画面と差分を確認し、必要な修正をコメントします。
5. 確認が済んだらPull Requestを取り込みます。両方が同じファイルを編集する場合は、先にIssueで担当範囲を相談します。

## 変更の目安

- 画面の文言やレイアウトは `index.html` と `styles.css` にあります。
- タスクの保存や操作は `app.js` にあります。
- 外部ライブラリーを追加する前に、標準のHTML / CSS / JavaScriptで実現できるか確認します。
- タスクデータはブラウザー内に保存され、ほかの人とは同期されません。同期やログインを追加する場合は、設計を先に相談してください。

