/**
 * Cloud Functions para notificações push de resultados de jogos.
 *
 * Pré-requisitos:
 *  1. Firebase Blaze plan (pay-as-you-go)
 *  2. `firebase init functions` já executado
 *  3. `firebase deploy --only functions`
 *
 * Envia push apenas quando um jogo ao vivo TERMINA (resultado final).
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

async function getAllTokens() {
  const snap = await db.collection('push_tokens').get();
  return snap.docs.map(d => d.data().token).filter(Boolean);
}

async function sendToAll(title, body, tag) {
  const tokens = await getAllTokens();
  if (!tokens.length) return;

  const message = {
    notification: { title, body },
    data: { title, body, tag },
    webpush: {
      notification: {
        icon: '/logo-sem-fundo.png',
        badge: '/logo-sem-fundo.png',
        vibrate: [200, 100, 200],
        tag,
        renotify: true,
      },
    },
  };

  // Send in batches of 500 (FCM limit)
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    await getMessaging().sendEachForMulticast({ ...message, tokens: batch });
  }
}

function getTimeName(teams, id) {
  const t = teams.find(t => t.id === id);
  return t ? t.nome : 'Time';
}

// Push when a match STARTS or ENDS (root collection `jogos`)
exports.onJogoUpdate = onDocumentUpdated('jogos/{jogoId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!after) return;

  const started = !before.ao_vivo && after.ao_vivo;
  const ended = before.ao_vivo && !after.ao_vivo;
  if (!started && !ended) return;

  const teamsSnap = await db.collection('times').get();
  const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const mand = getTimeName(teams, after.mandante);
  const visit = getTimeName(teams, after.visitante);

  if (started) {
    await sendToAll(
      '🔴 Jogo Ao Vivo!',
      `${mand} vs ${visit} começou agora!`,
      `live-start-${event.params.jogoId}`
    );
  } else {
    await sendToAll(
      '🏁 Resultado Final',
      `${mand} ${after.gols_mandante ?? 0} × ${after.gols_visitante ?? 0} ${visit}`,
      `result-${event.params.jogoId}`
    );
  }
});

exports.onMataMataUpdate = onDocumentUpdated('mata_mata/{matchId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!after) return;

  const started = !before.ao_vivo && after.ao_vivo;
  const ended = before.ao_vivo && !after.ao_vivo;
  if (!started && !ended) return;

  const teamsSnap = await db.collection('times').get();
  const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const mand = getTimeName(teams, after.mandante);
  const visit = getTimeName(teams, after.visitante);

  if (started) {
    await sendToAll(
      '🔴 Mata-Mata Ao Vivo!',
      `${mand} vs ${visit} começou agora!`,
      `live-start-${event.params.matchId}`
    );
  } else {
    await sendToAll(
      '🏁 Resultado Final (Mata-Mata)',
      `${mand} ${after.gols_mandante ?? 0} × ${after.gols_visitante ?? 0} ${visit}`,
      `result-${event.params.matchId}`
    );
  }
});
