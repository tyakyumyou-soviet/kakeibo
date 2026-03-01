// バージョン番号（ファイルを更新したら数字を増やす）
const VERSION = '4.0';
const CACHE_NAME = `kakeibo-app-v${VERSION}`;

const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json'
];

// インストール時にキャッシュを作成
self.addEventListener('install', (event) => {
    console.log('[Service Worker] インストール中...', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] キャッシュ作成完了');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                // 新しいService Workerを即座に有効化
                return self.skipWaiting();
            })
    );
});

// アクティベーション時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] アクティベート中...', CACHE_NAME);
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] 古いキャッシュを削除:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
            .then(() => {
                // すべてのクライアントで新しいService Workerを即座に制御
                return self.clients.claim();
            })
    );
});

// ネットワークファースト戦略（常に最新を取得、失敗時のみキャッシュ使用）
self.addEventListener('fetch', (event) => {
    // Firebaseや外部リソースはそのまま通す
    if (event.request.url.includes('firestore.googleapis.com') ||
        event.request.url.includes('fonts.googleapis.com') ||
        event.request.url.includes('cdn.jsdelivr.net')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 成功したらキャッシュを更新
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // ネットワークエラー時のみキャッシュを使用
                return caches.match(event.request);
            })
    );
});
