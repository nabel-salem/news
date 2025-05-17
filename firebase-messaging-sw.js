importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDfIBS2gB4lkRZ1_ZerLk451EVfafrfWSM",
  authDomain: "qtratamal.firebaseapp.com",
  projectId: "qtratamal",
  storageBucket: "qtratamal.appspot.com",
  messagingSenderId: "491056452067",
  appId: "1:491056452067:web:0c8ef019a651cd47c290d6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});