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

// sw.js already handles push display — this just suppresses the FCM default
messaging.onBackgroundMessage(() => {});
