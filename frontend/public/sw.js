// Display pushed marketplace alerts and open only same-origin application routes.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() ?? "You have a new UniBee update." };
  }

  event.waitUntil(self.registration.showNotification(data.title || "UniBee", {
    body: data.body || "You have a new marketplace update.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: data.tag || "unibee-marketplace-update",
    renotify: true,
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedPath = event.notification.data?.url;
  const path = typeof requestedPath === "string" && requestedPath.startsWith("/") && !requestedPath.startsWith("//")
    ? requestedPath
    : "/";

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      if ("navigate" in client) await client.navigate(path);
      return;
    }
    await self.clients.openWindow(new URL(path, self.location.origin).href);
  })());
});
