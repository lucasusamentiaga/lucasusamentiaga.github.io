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
 * `649c7e865816ec8b1b450543d6ff6249` lo sustituye `scripts/web-iphone.mjs` por la huella del bundle,
 * así cada publicación estrena caché y borra la anterior.
 */
const CACHE = 'lumbre-649c7e865816ec8b1b450543d6ff6249';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/')).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
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
