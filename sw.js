/**
 * LumbreAI — service worker de la web instalable (iPhone, "Añadir a pantalla
 * de inicio").
 *
 * Solo sirve para una cosa: que la app ABRA sin cobertura. Los datos ya viven
 * en el propio navegador (SQLite en web); sin esto, en un gimnasio en un sótano
 * el icono abría una pantalla de "no hay conexión" aunque todo estuviera dentro.
 *
 * - Ficheros con huella en el nombre (`/_expo/static/…`, `/assets/…`): nunca
 *   cambian, así que primero caché.
 * - Todo lo demás (la página): primero red, para que una versión nueva llegue
 *   sola; la caché solo se usa si no hay red.
 * - Otros dominios (Supabase, la IA, Open Food Facts) NO se tocan: van siempre
 *   a la red y nunca se guardan aquí.
 *
 * `01fd17d42fbb7aea6eac08fb41a4d16c` lo sustituye `scripts/web-iphone.mjs` por la huella del bundle,
 * así cada publicación estrena caché y borra la anterior.
 */
const CACHE = 'lumbre-01fd17d42fbb7aea6eac08fb41a4d16c';
// Los textos de los recordatorios (pushWeb.ts). NO es caché de versión: no se
// borra al publicar, o los avisos llegarían sin título hasta abrir la app.
const TEXTOS = 'lumbre-avisos';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/')).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE && k !== TEXTOS) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const pet = e.request;
  if (pet.method !== 'GET') return;
  const url = new URL(pet.url);
  if (url.origin !== self.location.origin) return;
  const inmutable = url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/');
  e.respondWith(inmutable ? primeroCache(pet) : primeroRed(pet));
});

async function primeroCache(pet) {
  const c = await caches.open(CACHE);
  const guardado = await c.match(pet);
  if (guardado) return guardado;
  const res = await fetch(pet);
  if (res.ok) c.put(pet, res.clone());
  return res;
}

async function primeroRed(pet) {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(pet);
    if (res.ok) c.put(pet, res.clone());
    return res;
  } catch (err) {
    // Sin red. Cualquier ruta de la app (`/perfil`, `/rangos`) es el mismo
    // index: si no está esa en concreto, vale la raíz.
    const guardado = (await c.match(pet)) ?? (pet.mode === 'navigate' ? await c.match('/') : undefined);
    if (guardado) return guardado;
    throw err;
  }
}

/**
 * Avisos (Web Push, lección 158). El servidor solo manda una referencia opaca
 * (`{"ref":"r3"}`); el texto está en la caché TEXTOS, que escribe la app. Si
 * no está (caché borrada), un texto genérico: un aviso sin título es mejor que
 * ninguno, y uno con el título equivocado, peor.
 */
self.addEventListener('push', (e) => {
  e.waitUntil(
    (async () => {
      let ref = '';
      try {
        ref = String((e.data && e.data.json() && e.data.json().ref) || '');
      } catch (_) {
        ref = '';
      }
      let texto = null;
      try {
        const c = await caches.open(TEXTOS);
        const r = await c.match('/__avisos__');
        const todos = r ? await r.json() : {};
        texto = todos[ref] || null;
      } catch (_) {
        texto = null;
      }
      const titulo = (texto && texto.t) || 'LumbreAI';
      const cuerpo = (texto && texto.b) || '';
      await self.registration.showNotification(titulo, {
        body: cuerpo,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: ref || undefined,
        data: { url: '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    (async () => {
      const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of abiertas) if ('focus' in c) return c.focus();
      return self.clients.openWindow('/');
    })(),
  );
});
