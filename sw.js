// Self-removing worker: prevents earlier cached dashboard versions from persisting.
self.addEventListener('install',event=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.map(key=>caches.delete(key)));
  await self.registration.unregister();
  const pages=await self.clients.matchAll({type:'window'});
  for(const page of pages) page.navigate(page.url);
})()));
self.addEventListener('fetch',()=>{});
