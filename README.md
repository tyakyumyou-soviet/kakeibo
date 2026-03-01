# 家計簿アプリ - セットアップガイド

Firebase Firestoreを使用した、クレジットカード別に支出を管理できる家計簿アプリです。

## 機能

✅ クレジットカード別に支出を計上
✅ カード別・総合計の自動集計
✅ 月別データの閲覧
✅ 月の自動切り替え
✅ デバッグモード(日付を任意に設定可能)

## セットアップ手順

### 1. Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力(例: "家計簿アプリ")
4. Google アナリティクスは不要なので無効化可能
5. プロジェクトを作成

### 2. Firestoreデータベースの有効化

1. Firebaseコンソールで「Firestore Database」を選択
2. 「データベースを作成」をクリック
3. **テストモードで開始**を選択(開発用)
4. ロケーションは `asia-northeast1` (東京)を推奨
5. データベースを作成

### 3. セキュリティルールの設定

Firestoreコンソールの「ルール」タブで以下のルールを設定:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

**⚠️ 注意**: このルールは開発用です。本番環境では認証を追加してください。

### 4. Firebase設定情報の取得

1. Firebaseコンソールの「プロジェクトの設定」(⚙️アイコン)をクリック
2. 「全般」タブを選択
3. 「マイアプリ」セクションまでスクロール
4. 「</> (Web)」アイコンをクリック
5. アプリのニックネームを入力(例: "家計簿Web")
6. 「Firebase Hosting も設定する」はチェック不要
7. 「アプリを登録」をクリック
8. 表示される `firebaseConfig` オブジェクトをコピー

### 5. app.jsの設定

`app.js` ファイルの12-19行目のFirebase設定を、取得した情報で置き換えてください:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",              // ← ここを置き換え
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 6. ローカルサーバーで起動

JavaScriptモジュールを使用しているため、ローカルサーバーが必要です。

**方法1: Python (推奨)**
```bash
cd /Users/tyakyumyou/家計簿アプリ
python3 -m http.server 8000
```

**方法2: Node.js (http-server)**
```bash
npx http-server -p 8000
```

ブラウザで `http://localhost:8000` にアクセス

## 使い方

### クレジットカードの追加
1. 「クレジットカード管理」セクションでカード名を入力
2. 「カードを追加」をクリック
3. 自動的にランダムな色が割り当てられます

### 支出の追加
1. 「支出を追加」セクションでカードを選択
2. 金額、カテゴリ、日付を入力
3. 説明は任意
4. 「支出を追加」をクリック

### 月の切り替え
- ヘッダーの「表示月」ドロップダウンで月を選択
- 過去12ヶ月分の履歴を閲覧可能

### デバッグモード
1. ヘッダーの「デバッグモード」トグルをON
2. 任意の日付を入力
3. 「日付を適用」をクリック
4. 指定した日付が現在日時として使用されます

## トラブルシューティング

### Firebaseに接続できない
- ブラウザのコンソール(F12)でエラーを確認
- `app.js` のFirebase設定が正しいか確認
- Firestoreが有効化されているか確認

### データが表示されない
- 月選択が正しいか確認
- Firestoreコンソールでデータが保存されているか確認
- ブラウザコンソールでエラーを確認

### スタイルが適用されない
- `styles.css` が正しく読み込まれているか確認
- ブラウザのキャッシュをクリア(Ctrl+Shift+R / Cmd+Shift+R)

## 技術スタック

- **HTML5**: セマンティックな構造
- **CSS3**: ガラスモーフィズム、グラデーション、アニメーション
- **JavaScript (ES6 Modules)**: Firebase SDK v9
- **Firebase Firestore**: NoSQLデータベース

## ファイル構成

```
家計簿アプリ/
├── index.html      # HTMLメインファイル
├── styles.css      # スタイルシート
├── app.js          # アプリケーションロジック
└── README.md       # このファイル
```

## データ構造

### creditCards コレクション
```javascript
{
  name: string,        // カード名
  color: string,       // 表示色 (HEX)
  createdAt: timestamp // 作成日時
}
```

### expenses コレクション
```javascript
{
  cardId: string,      // カードID
  cardName: string,    // カード名
  amount: number,      // 金額
  category: string,    // カテゴリ
  description: string, // 説明
  date: timestamp,     // 日付
  yearMonth: string,   // 年月 (YYYY-MM)
  createdAt: timestamp // 作成日時
}
```

## ライセンス

MIT License
