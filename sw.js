const CACHE_NAME = 'tripnote-v6';

const CORE_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png'
];

/* インストール */
self.addEventListener(
  'install',
  event => {

    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then(cache =>
          cache.addAll(CORE_FILES)
        )
    );

  }
);

/* 古いキャッシュを削除 */
self.addEventListener(
  'activate',
  event => {

    event.waitUntil(

      caches
        .keys()
        .then(keys =>
          Promise.all(
            keys
              .filter(
                key =>
                  key !== CACHE_NAME
              )
              .map(
                key =>
                  caches.delete(key)
              )
          )
        )
        .then(() =>
          self.clients.claim()
        )

    );

  }
);

/* 更新ボタンから指示 */
self.addEventListener(
  'message',
  event => {

    if(
      event.data
      &&
      event.data.type ===
      'SKIP_WAITING'
    ){

      self.skipWaiting();

    }

  }
);

/* 通信処理 */
self.addEventListener(
  'fetch',
  event => {

    const request =
      event.request;

    if(
      request.method !==
      'GET'
    ){
      return;
    }

    const url =
      new URL(
        request.url
      );

    /*
      SupabaseやAPIはキャッシュしない
    */
    if(
      url.pathname.startsWith('/api/')
      ||
      url.hostname.includes('supabase')
    ){
      return;
    }

    /*
      index.html / トップページは
      必ずネットを優先
    */
    if(
      request.mode ===
      'navigate'
    ){

      event.respondWith(

        fetch(request)
          .then(response => {

            const copy =
              response.clone();

            caches
              .open(CACHE_NAME)
              .then(cache =>
                cache.put(
                  '/index.html',
                  copy
                )
              );

            return response;

          })
          .catch(() =>
            caches.match(
              '/index.html'
            )
          )

      );

      return;
    }

    /*
      画像やmanifestなど
    */
    event.respondWith(

      caches
        .match(request)
        .then(cached => {

          const networkFetch =
            fetch(request)
              .then(response => {

                if(
                  response
                  &&
                  response.ok
                ){

                  const copy =
                    response.clone();

                  caches
                    .open(CACHE_NAME)
                    .then(cache =>
                      cache.put(
                        request,
                        copy
                      )
                    );

                }

                return response;

              });

          return (
            cached
            ||
            networkFetch
          );

        })

    );

  }
);
