/**
 * Cloud Functions para notificações push de jogos ao vivo.
 *
 * Pré-requisitos:
 *  1. Firebase Blaze plan (pay-as-you-go)
 *  2. `firebase init functions` já executado
 *  3. `firebase deploy --only functions`
 *
 * Coleta tokens FCM da coleção `push_tokens` e envia
 * para todos quando há mudança de placar em jogos ao vivo.
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

// Watch `jogos` collection for live match changes
exports.onJogoUpdate = onDocumentUpdated('campeonatos/{campId}/jogos/{jogoId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!after) return;

  // Fetch teams for names
  const teamsSnap = await db.collection(`campeonatos/${event.params.campId}/times`).get();
  const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const mand = getTimeName(teams, after.mandante);
  const visit = getTimeName(teams, after.visitante);

  // Match just started
  if (!before.ao_vivo && after.ao_vivo) {
    await sendToAll(
      '🔴 Jogo Ao Vivo!',
      `${mand} vs ${visit} começou agora!`,
      `live-start-${event.params.jogoId}`
    );
    return;
  }

  // Match ended
  if (before.ao_vivo && !after.ao_vivo) {
    await sendToAll(
      '🏁 Fim de Jogo!',
      `${mand} ${after.gols_mandante ?? 0} × ${after.gols_visitante ?? 0} ${visit}`,
      `live-end-${event.params.jogoId}`
    );
    return;
  }

  // Score changed during live match
  if (after.ao_vivo) {
    const golsMandBefore = before.gols_mandante ?? 0;
    const golsVisitBefore = before.gols_visitante ?? 0;
    const golsMandAfter = after.gols_mandante ?? 0;
    const golsVisitAfter = after.gols_visitante ?? 0;

    if (golsMandAfter > golsMandBefore) {
      await sendToAll(
        `⚽ GOL! ${mand}`,
        `${mand} ${golsMandAfter} × ${golsVisitAfter} ${visit}`,
        `goal-${event.params.jogoId}`
      );
    } else if (golsVisitAfter > golsVisitBefore) {
      await sendToAll(
        `⚽ GOL! ${visit}`,
        `${mand} ${golsMandAfter} × ${golsVisitAfter} ${visit}`,
        `goal-${event.params.jogoId}`
      );
    }
  }
});

// Watch `mata_mata` collection too
exports.onMataMataUpdate = onDocumentUpdated('campeonatos/{campId}/mata_mata/{matchId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!after) return;

  const teamsSnap = await db.collection(`campeonatos/${event.params.campId}/times`).get();
  const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const mand = getTimeName(teams, after.mandante);
  const visit = getTimeName(teams, after.visitante);

  if (!before.ao_vivo && after.ao_vivo) {
    await sendToAll(
      '🔴 Mata-Mata Ao Vivo!',
      `${mand} vs ${visit} começou agora!`,
      `live-start-${event.params.matchId}`
    );
    return;
  }

  if (before.ao_vivo && !after.ao_vivo) {
    await sendToAll(
      '🏁 Fim de Jogo (Mata-Mata)!',
      `${mand} ${after.gols_mandante ?? 0} × ${after.gols_visitante ?? 0} ${visit}`,
      `live-end-${event.params.matchId}`
    );
    return;
  }

  if (after.ao_vivo) {
    const golsMandBefore = before.gols_mandante ?? 0;
    const golsVisitBefore = before.gols_visitante ?? 0;
    const golsMandAfter = after.gols_mandante ?? 0;
    const golsVisitAfter = after.gols_visitante ?? 0;

    if (golsMandAfter > golsMandBefore) {
      await sendToAll(
        `⚽ GOL! ${mand}`,
        `${mand} ${golsMandAfter} × ${golsVisitAfter} ${visit}`,
        `goal-${event.params.matchId}`
      );
    } else if (golsVisitAfter > golsVisitBefore) {
      await sendToAll(
        `⚽ GOL! ${visit}`,
        `${mand} ${golsMandAfter} × ${golsVisitAfter} ${visit}`,
        `goal-${event.params.matchId}`
      );
    }
  }
});
