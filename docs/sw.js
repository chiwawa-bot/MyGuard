// 最簡單的 Service Worker - 只負責讓 PWA 可以安裝
self.addEventListener('install', (event) => {
  console.log('Service Worker 安裝完成');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker 啟動完成');
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 直接放行所有請求,不做任何快取
  event.respondWith(fetch(event.request));
});