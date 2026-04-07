// Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDKPy8Q8BNGUqGZ-DFIGyjguS7ZD_r9V8Q",
  authDomain: "organizador-de-campeonato.firebaseapp.com",
  projectId: "organizador-de-campeonato",
  storageBucket: "organizador-de-campeonato.firebasestorage.app",
  messagingSenderId: "574392149055",
  appId: "1:574392149055:web:75225d6719270b6b4dc48a"
});

const messaging = firebase.messaging();

// Handle background push messages
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || payload.notification || {};
  const title = data.title || '⚽ Campeonato';
  const options = {
    body: data.body || 'Atualização do campeonato!',
    icon: './logo-sem-fundo.png',
    badge: './logo-sem-fundo.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'campeonato',
    renotify: true,
  };
  return self.registration.showNotification(title, options);
});
