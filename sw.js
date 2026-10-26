/* Gestão de Valores: trabalhador de instalação sem cache de informações financeiras. */
self.addEventListener('install', function (event) { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
