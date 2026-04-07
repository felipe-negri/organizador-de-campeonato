/**
 * Cloud Functions para notificações push de resultados de jogos.
 *
 * Função unificada para jogos (fase de grupos) e mata-mata.
 * Envia push quando um jogo ao vivo INICIA ou TERMINA.
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

  const message = { data: { title, body, tag } };

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const result = await getMessaging().sendEachForMulticast({ ...message, tokens: batch });
    const stale = [];
    result.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error &&
          (resp.error.code === 'messaging/registration-token-not-registered' ||
           resp.error.code === 'messaging/invalid-registration-token')) {
        stale.push(batch[idx]);
      }
    });
    for (const t of stale) {
      await db.collection('push_tokens').doc(t).delete().catch(() => {});
    }
  }
}

async function notifyMatch(event, collection) {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!after) return;

  const started = !before.ao_vivo && after.ao_vivo;
  const ended = before.ao_vivo && !after.ao_vivo;
  if (!started && !ended) return;

  const isBracket = collection === 'mata_mata';
  // jogos: mandante/visitante (nomes), mata_mata: time1/time2 (nomes)
  const home = isBracket ? after.time1 : after.mandante;
  const away = isBracket ? after.time2 : after.visitante;
  const goalsH = isBracket ? (after.gols1 ?? 0) : (after.gols_mandante ?? 0);
  const goalsA = isBracket ? (after.gols2 ?? 0) : (after.gols_visitante ?? 0);
  const docId = Object.values(event.params)[0];
  const label = isBracket ? ' (Mata-Mata)' : '';

  if (started) {
    await sendToAll(
      `�� Jogo Ao Vivo${label}! 🔴`,
      `${home || 'Time'} vs ${away || 'Time'} começou agora! 🏐🔥`,
      `live-start-${docId}`
    );
  } else {
    await sendToAll(
      `🏁 Resultado Final${label} 🏁`,
      `${home || 'Time'} ${goalsH} × ${goalsA} ${away || 'Time'} ⚽🏆`,
      `result-${docId}`
    );
  }
}

exports.onJogoUpdate = onDocumentUpdated('jogos/{docId}', (event) => notifyMatch(event, 'jogos'));
exports.onMataMataUpdate = onDocumentUpdated('mata_mata/{docId}', (event) => notifyMatch(event, 'mata_mata'));
