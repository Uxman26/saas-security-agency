let soundMuted = false;

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'ControlOps';
  const options = {
    body: data.body || '',
    icon: '/ControlOps-Logos/controlOps-icon.png',
    data: { url: data.url || '/leads' },
    silent: Boolean(soundMuted || data.silent),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/leads';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'NOTIF_SOUND_MUTE') {
    soundMuted = Boolean(event.data.muted);
    return;
  }
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, url, silent } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: '/ControlOps-Logos/controlOps-icon.png',
      data: { url: url || '/leads' },
      silent: Boolean(silent ?? soundMuted),
    });
  }
});
