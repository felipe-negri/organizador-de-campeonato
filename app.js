// app.js — Championship Dashboard powered by Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {
    getFirestore, collection, doc,
    setDoc, addDoc, updateDoc, deleteDoc,
    onSnapshot, writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';
import {
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: 'AIzaSyDKPy8Q8BNGUqGZ-DFIGyjguS7ZD_r9V8Q',
    authDomain: 'organizador-de-campeonato.firebaseapp.com',
    projectId: 'organizador-de-campeonato',
    storageBucket: 'organizador-de-campeonato.firebasestorage.app',
    messagingSenderId: '574392149055',
    appId: '1:574392149055:web:75225d6719270b6b4dc48a',
};

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);

// ─── Image Crop ───────────────────────────────────────────────────────────────
const CROP_SIZE = 300;
const crop = { img: null, scale: 1, ox: 0, oy: 0, dragging: false, lastX: 0, lastY: 0, pinchDist: 0, hiddenInput: null, wrap: null };

function openCropModal(file, hiddenInput, wrap) {
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            crop.img = img;
            crop.hiddenInput = hiddenInput;
            crop.wrap = wrap;
            const s = Math.max(CROP_SIZE / img.width, CROP_SIZE / img.height);
            crop.scale = s;
            crop.ox = (CROP_SIZE - img.width * s) / 2;
            crop.oy = (CROP_SIZE - img.height * s) / 2;
            drawCrop();
            $('#crop-modal').classList.remove('hidden');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function drawCrop() {
    const canvas = $('#crop-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
    if (crop.img) ctx.drawImage(crop.img, crop.ox, crop.oy, crop.img.width * crop.scale, crop.img.height * crop.scale);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    [1, 2].forEach(n => {
        ctx.beginPath(); ctx.moveTo(n * CROP_SIZE / 3, 0); ctx.lineTo(n * CROP_SIZE / 3, CROP_SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, n * CROP_SIZE / 3); ctx.lineTo(CROP_SIZE, n * CROP_SIZE / 3); ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, CROP_SIZE - 2, CROP_SIZE - 2);
}

function cropClamp() {
    const iw = crop.img.width * crop.scale, ih = crop.img.height * crop.scale;
    if (iw >= CROP_SIZE) crop.ox = Math.min(0, Math.max(CROP_SIZE - iw, crop.ox));
    if (ih >= CROP_SIZE) crop.oy = Math.min(0, Math.max(CROP_SIZE - ih, crop.oy));
}

function cropZoom(delta, cx, cy) {
    const minS = Math.max(CROP_SIZE / crop.img.width, CROP_SIZE / crop.img.height);
    const newS = Math.max(minS, Math.min(crop.scale * delta, 10));
    crop.ox = cx - (cx - crop.ox) * (newS / crop.scale);
    crop.oy = cy - (cy - crop.oy) * (newS / crop.scale);
    crop.scale = newS;
    cropClamp(); drawCrop();
}

function confirmCrop() {
    const out = document.createElement('canvas');
    out.width = CROP_SIZE; out.height = CROP_SIZE;
    out.getContext('2d').drawImage(crop.img, crop.ox, crop.oy, crop.img.width * crop.scale, crop.img.height * crop.scale);
    const base64 = out.toDataURL('image/jpeg', 0.8);
    crop.hiddenInput.value = base64;
    const wrap = crop.wrap;
    const existing = wrap.querySelector('.player-foto-preview');
    if (existing?.tagName === 'IMG') { existing.src = base64; }
    else if (existing) { existing.outerHTML = `<img src="${base64}" class="player-foto-preview" alt="foto">`; }
    else { const img = document.createElement('img'); img.src = base64; img.className = 'player-foto-preview'; wrap.prepend(img); }
    if (!wrap.querySelector('.player-foto-remove')) {
        const idx = crop.hiddenInput.dataset.idx;
        const btn = document.createElement('button');
        btn.className = 'btn btn-danger btn-sm player-foto-remove'; btn.dataset.idx = idx; btn.textContent = '🗑️';
        btn.addEventListener('click', () => handlePhotoRemove(idx));
        wrap.appendChild(btn);
    }
    closeCropModal();
}

function closeCropModal() {
    $('#crop-modal').classList.add('hidden');
    crop.img = null; crop.hiddenInput = null; crop.wrap = null;
}

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
    isAdmin: false,
    config: {},
    teams: [],
    matches: [],
    knockout: [],
    standings: [],
    currentRound: 1,
    totalRounds: 0,
    roundInitialized: false,
    theme: localStorage.getItem('theme') || 'dark',
    dataReady: { config: false, teams: false, matches: false, knockout: false },
    editingMatch: null,
    editingMatchId: null,
    editingBracket: null,
    editingTeamId: null,
};

// ─── DOM helpers ──────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('#theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('theme', theme);
    state.theme = theme;
}

// ─── Loading / Error ──────────────────────────────────────────────────────────
function showLoading(show) {
    $('#loading').classList.toggle('hidden', !show);
    if (show) {
        $$('.tab-content').forEach(el => el.classList.add('hidden'));
    } else {
        const active = $('.nav-tab.active');
        if (active) showTab(active.dataset.tab);
    }
}

function showToast(msg, type = 'success', duration = 3000) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
    $('#toast-container').appendChild(el);
    setTimeout(() => {
        el.classList.add('hiding');
        el.addEventListener('animationend', () => el.remove());
    }, duration);
}

function showError(msg) {
    showToast(msg, 'error', 5000);
}

function hideError() {
    $('#error-message').classList.add('hidden');
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function showTab(tabId) {
    $$('.tab-content').forEach(el => el.classList.add('hidden'));
    $$('.nav-tab').forEach(el => el.classList.remove('active'));
    const tab = $(`#tab-${tabId}`);
    const btn = $(`.nav-tab[data-tab="${tabId}"]`);
    if (tab) tab.classList.remove('hidden');
    if (btn) btn.classList.add('active');
}

// ─── Data ready ───────────────────────────────────────────────────────────────
function onDataUpdate() {
    if (!Object.values(state.dataReady).every(Boolean)) return;
    showLoading(false);
    calculateStandings();
    const hasData = state.teams.length > 0 || state.matches.length > 0 || state.config.nome_campeonato;
    if (!hasData && !state.isAdmin) {
        $('#setup-message').classList.remove('hidden');
        return;
    }
    $('#setup-message').classList.add('hidden');
    renderAll();
}

// ─── Standings ────────────────────────────────────────────────────────────────
function calculateStandings() {
    const stats = {};
    state.teams.forEach(t => {
        stats[t.nome] = {
            id: t.id, name: t.nome, abbr: t.sigla, color: t.cor,
            cores: t.cores || (t.cor ? [t.cor] : ['#888']),
            pts: 0, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0,
            tbWins: 0, tbLosses: 0,
        };
    });

    state.matches.forEach(m => {
        if (m.gols_mandante == null || m.gols_visitante == null) return;
        const home = stats[m.mandante];
        const away = stats[m.visitante];
        if (!home || !away) return;

        home.played++; away.played++;
        home.gf += m.gols_mandante; home.ga += m.gols_visitante;
        away.gf += m.gols_visitante; away.ga += m.gols_mandante;

        if (m.gols_mandante > m.gols_visitante) {
            if (m.tiebreak) {
                home.tbWins++; home.pts += 2;
                away.tbLosses++; away.pts += 1;
            } else {
                home.wins++; home.pts += 3; away.losses++;
            }
        } else if (m.gols_mandante < m.gols_visitante) {
            if (m.tiebreak) {
                away.tbWins++; away.pts += 2;
                home.tbLosses++; home.pts += 1;
            } else {
                away.wins++; away.pts += 3; home.losses++;
            }
        } else {
            home.draws++; home.pts += 1;
            away.draws++; away.pts += 1;
        }
    });

    state.standings = Object.values(stats).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.wins !== a.wins) return b.wins - a.wins;
        const sgA = a.gf - a.ga, sgB = b.gf - b.ga;
        if (sgB !== sgA) return sgB - sgA;
        return b.gf - a.gf;
    });
}

// ─── Render All ───────────────────────────────────────────────────────────────
function renderAll() {
    const name = state.config.nome_campeonato || 'Campeonato';
    const hideName = state.config.ocultar_nome;
    $('#championship-name').textContent = hideName ? '' : name;
    $('#championship-name').classList.toggle('hidden', !!hideName);
    document.title = hideName ? 'Dashboard' : `Dashboard - ${name}`;
    renderStandings();
    renderNextMatches();
    renderMatches();
    renderBracket();
    renderRules();
    renderAbout();
    if (state.isAdmin) renderAdminPanel();
    $('#last-updated').textContent = new Date().toLocaleString('pt-BR');
}

// ─── Render Standings ─────────────────────────────────────────────────────────
function renderStandings() {
    const qualify = parseInt(state.config.classificados) || 8;
    const totalPlayed = state.matches.filter(m => m.gols_mandante != null).length;
    $('#matches-played-badge').textContent = `${totalPlayed}/${state.matches.length} jogos`;

    if (state.totalRounds > 0) {
        const currentRound = findCurrentRound();
        const roundBadge = $('#current-round-badge');
        roundBadge.textContent = `Rodada ${currentRound} de ${state.totalRounds}`;
        roundBadge.classList.remove('hidden');
    }

    let html = '';
    state.standings.forEach((t, i) => {
        const pos = i + 1;
        const gd = t.gf - t.ga;
        const isQualify = pos <= qualify;
        const isLastQualify = pos === qualify;
        const gdSign = gd > 0 ? '+' : '';
        const gdClass = gd > 0 ? 'sg-positive' : gd < 0 ? 'sg-negative' : '';
        html += `<tr class="${isQualify ? 'qualify' : ''} ${isLastQualify ? 'qualify-border' : ''}">
            <td class="col-pos">${pos}</td>
            <td class="col-team">
                ${teamColorPill(t, 16)}
                <span class="team-name-link" data-team="${t.name}" style="margin-left:6px">${t.name}</span>
            </td>
            <td class="col-stat-pts">${t.pts}</td>
            <td>${t.played}</td>
            <td>${t.wins}</td>
            <td class="col-hide-mobile">${t.tbWins}</td>
            <td>${t.draws}</td>
            <td class="col-hide-mobile">${t.tbLosses}</td>
            <td>${t.losses}</td>
            <td class="col-hide-mobile">${t.gf}</td>
            <td class="col-hide-mobile">${t.ga}</td>
            <td class="col-stat-sg ${gdClass}">${gdSign}${gd}</td>
        </tr>`;
    });
    $('#standings-body').innerHTML = html;
    bindTeamPopovers();
}

// ─── Render Matches ───────────────────────────────────────────────────────────
function renderMatches() {
    state.totalRounds = state.matches.length > 0
        ? Math.max(...state.matches.map(m => m.rodada || 0))
        : 0;

    if (!state.roundInitialized && state.totalRounds > 0) {
        state.currentRound = findCurrentRound();
        state.roundInitialized = true;
    }

    if (state.currentRound < 1) state.currentRound = 1;
    if (state.currentRound > state.totalRounds) state.currentRound = Math.max(1, state.totalRounds);

    updateRoundNav();

    if (state.totalRounds === 0) {
        $('#matches-container').innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">Nenhuma partida cadastrada</p>';
        return;
    }

    const roundMatches = state.matches
        .filter(m => m.rodada === state.currentRound)
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    if (roundMatches.length === 0) {
        $('#matches-container').innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">Nenhum jogo nesta rodada</p>';
        return;
    }

    const teamMap = {};
    state.teams.forEach(t => { teamMap[t.nome] = t; });

    let html = '';
    roundMatches.forEach(m => {
        const played = m.gols_mandante != null;
        const homeTeam = teamMap[m.mandante] || { cor: '#888' };
        const awayTeam = teamMap[m.visitante] || { cor: '#888' };
        let homeWinner = '', awayWinner = '';
        if (played) {
            if (m.gols_mandante > m.gols_visitante) homeWinner = 'winner';
            else if (m.gols_visitante > m.gols_mandante) awayWinner = 'winner';
        }
        const tbBadge = played && m.tiebreak ? '<span class="tiebreak-badge">TB</span>' : '';
        const dateInfo = m.data_hora
            ? `<div class="match-date-info">📅 ${formatDate(m.data_hora)}</div>`
            : `<div class="match-date-info match-date-tbd">📅 A definir</div>`;
        html += `<div class="match-card ${played ? '' : 'not-played'}">
            <div class="match-teams">
                <div class="match-team home">
                    ${teamColorPill(homeTeam, 14)}
                    <span class="match-team-name ${homeWinner}">${m.mandante}</span>
                </div>
                <div class="match-score ${played ? '' : 'pending'}">
                    ${played
                        ? `<span>${m.gols_mandante}</span><span class="sep">×</span><span>${m.gols_visitante}</span>${tbBadge}`
                        : `<span>vs</span>`}
                </div>
                <div class="match-team away">
                    ${teamColorPill(awayTeam, 14)}
                    <span class="match-team-name ${awayWinner}">${m.visitante}</span>
                </div>
            </div>
            ${!played ? dateInfo : (m.data_hora ? `<div class="match-date-info">📅 ${formatDate(m.data_hora)}</div>` : '')}
            ${state.isAdmin ? `<button class="edit-match-btn" data-id="${m.id}" title="Editar placar">✏️ editar</button>` : ''}
        </div>`;
    });

    $('#matches-container').innerHTML = html;

    if (state.isAdmin) {
        $$('.edit-match-btn').forEach(btn => {
            btn.addEventListener('click', () => openEditScoreModal(btn.dataset.id));
        });
    }
}

function findCurrentRound() {
    for (let r = 1; r <= state.totalRounds; r++) {
        const roundMatches = state.matches.filter(m => m.rodada === r);
        if (roundMatches.some(m => m.gols_mandante == null)) return r;
    }
    return state.totalRounds || 1;
}

function updateRoundNav() {
    $('#round-label').textContent = `Rodada ${state.currentRound}`;
    $('#prev-round').disabled = state.currentRound <= 1;
    $('#next-round').disabled = state.currentRound >= state.totalRounds;
}

// ─── Render Bracket ───────────────────────────────────────────────────────────
function renderBracket() {
    const phases = ['quartas', 'semis', 'final'];
    const phaseLabels = { quartas: 'Quartas de Final', semis: 'Semifinais', final: 'Final' };

    const finalMatch = state.knockout.find(m => m.fase === 'final');
    if (finalMatch && finalMatch.gols1 != null && finalMatch.gols2 != null && finalMatch.time1 && finalMatch.time2) {
        let champion = null;
        if (finalMatch.gols1 > finalMatch.gols2) champion = finalMatch.time1;
        else if (finalMatch.gols2 > finalMatch.gols1) champion = finalMatch.time2;
        else if (finalMatch.pen1 != null && finalMatch.pen2 != null) {
            if (finalMatch.pen1 > finalMatch.pen2) champion = finalMatch.time1;
            else if (finalMatch.pen2 > finalMatch.pen1) champion = finalMatch.time2;
        }
        if (champion) {
            $('#champion-banner').classList.remove('hidden');
            $('#champion-name').textContent = champion;
        } else {
            $('#champion-banner').classList.add('hidden');
        }
    } else {
        $('#champion-banner').classList.add('hidden');
    }

    let html = '';
    phases.forEach(phase => {
        const matches = state.knockout
            .filter(m => m.fase === phase)
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        html += `<div class="bracket-round">
            <div class="bracket-round-title">${phaseLabels[phase] || phase}</div>
            <div class="bracket-matches">`;
        if (matches.length === 0) {
            const count = phase === 'quartas' ? 4 : phase === 'semis' ? 2 : 1;
            for (let i = 0; i < count; i++) {
                html += renderBracketMatch({ id: null, time1: '', time2: '', gols1: null, gols2: null, pen1: null, pen2: null });
            }
        } else {
            matches.forEach(m => { html += renderBracketMatch(m); });
        }
        html += `</div></div>`;
    });

    $('#bracket-container').innerHTML = html;

    if (state.isAdmin) {
        $$('.edit-bracket-btn').forEach(btn => {
            btn.addEventListener('click', () => openEditBracketModal(btn.dataset.id));
        });
    }
}

function renderBracketMatch(m) {
    const played = m.gols1 != null && m.gols2 != null;
    let winner = null;
    if (played && m.time1 && m.time2) {
        if (m.gols1 > m.gols2) winner = 1;
        else if (m.gols2 > m.gols1) winner = 2;
        else if (m.pen1 != null && m.pen2 != null) {
            if (m.pen1 > m.pen2) winner = 1;
            else if (m.pen2 > m.pen1) winner = 2;
        }
    }
    const t1c = !m.time1 ? 'tbd' : (winner === 1 ? 'winner' : winner === 2 ? 'loser' : '');
    const t2c = !m.time2 ? 'tbd' : (winner === 2 ? 'winner' : winner === 1 ? 'loser' : '');
    const s1 = played ? String(m.gols1) + (m.pen1 != null ? ` (${m.pen1})` : '') : '';
    const s2 = played ? String(m.gols2) + (m.pen2 != null ? ` (${m.pen2})` : '') : '';
    const editBtn = state.isAdmin && m.id
        ? `<button class="edit-bracket-btn" data-id="${m.id}" title="Editar partida">✏️ editar</button>`
        : '';
    return `<div class="bracket-match">
        <div class="bracket-team ${t1c}">
            <span class="bracket-team-name">${m.time1 || 'A definir'}</span>
            <span class="bracket-team-score">${s1}</span>
        </div>
        <div class="bracket-team ${t2c}">
            <span class="bracket-team-name">${m.time2 || 'A definir'}</span>
            <span class="bracket-team-score">${s2}</span>
        </div>
        ${m.data_hora ? `<div class="match-date-info">📅 ${formatDate(m.data_hora)}</div>` : ''}
        ${editBtn}
    </div>`;
}

// ─── Render Rules ─────────────────────────────────────────────────────────────
function renderRules() {
    const rulesText = state.config.regras || '';
    const container = $('#rules-content');
    if (!container) return;
    if (!rulesText.trim()) {
        container.innerHTML = '<p class="hint">Nenhuma regra cadastrada ainda.</p>';
        return;
    }
    const escaped = rulesText
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    container.innerHTML = `<p>${escaped}</p>`;
}

function formatDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Returns a thin vertical color bar with diagonal chamfer between color segments
function teamColorPill(t, height = 16) {
    const cores = t.cores || (t.cor ? [t.cor] : ['#888']);
    const w = 4;
    const n = cores.length;
    const chamfer = 2; // smaller diagonal, fixed px

    let segs = '';
    if (n === 1) {
        segs = `<rect x="0" y="0" width="${w}" height="${height}" fill="${cores[0]}"/>`;
    } else {
        const segH = height / n;
        cores.forEach((c, i) => {
            const y0 = i * segH;
            const y1 = (i + 1) * segH;
            // Inverted chamfer: right side leads (top-right higher than top-left)
            const top_left_y  = i === 0 ? y0 : y0 + chamfer;
            const top_right_y = i === 0 ? y0 : y0 - chamfer;
            const bot_left_y  = i === n - 1 ? y1 : y1 + chamfer;
            const bot_right_y = i === n - 1 ? y1 : y1 - chamfer;
            segs += `<polygon points="0,${top_left_y} ${w},${top_right_y} ${w},${bot_right_y} 0,${bot_left_y}" fill="${c}"/>`;
        });
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height}" style="border-radius:2px;vertical-align:middle;flex-shrink:0;margin-right:6px;overflow:hidden">${segs}</svg>`;
}

function renderNextMatches() {
    const section = $('#next-matches-section');
    const list = $('#next-matches-list');
    if (!section || !list) return;

    const teamMap = {};
    state.teams.forEach(t => { teamMap[t.nome] = t; });

    const now = new Date();
    const upcoming = state.matches
        .filter(m => m.gols_mandante == null)
        .sort((a, b) => {
            if (a.data_hora && b.data_hora) return new Date(a.data_hora) - new Date(b.data_hora);
            if (a.data_hora) return -1;
            if (b.data_hora) return 1;
            return (a.rodada - b.rodada) || ((a.ordem || 0) - (b.ordem || 0));
        })
        .slice(0, 3);

    if (upcoming.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    list.innerHTML = upcoming.map(m => {
        const ht = teamMap[m.mandante] || { cor: '#888' };
        const at = teamMap[m.visitante] || { cor: '#888' };
        const dateStr = m.data_hora ? formatDate(m.data_hora) : '📅 A definir';
        const roundStr = `Rodada ${m.rodada}`;
        return `<div class="next-match-card">
            <div class="next-match-meta">
                <span class="next-match-round">${roundStr}</span>
                <span class="next-match-date">${dateStr}</span>
            </div>
            <div class="next-match-teams">
                <span class="next-match-team">${teamColorPill(ht, 14)} ${m.mandante}</span>
                <span class="next-match-vs">vs</span>
                <span class="next-match-team">${teamColorPill(at, 14)} ${m.visitante}</span>
            </div>
        </div>`;
    }).join('');
}

function renderAbout() {
    const text = state.config.sobre || '';
    const container = $('#about-content');
    if (!container) return;
    if (!text.trim()) {
        container.innerHTML = '<p class="hint">Nenhuma informação cadastrada ainda.</p>';
        return;
    }
    const escaped = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    container.innerHTML = `<p>${escaped}</p>`;
}

// ─── Team Popover / Card ──────────────────────────────────────────────────────
function buildTeamCardHtml(team) {
    const jogadores = team.jogadores || [];
    if (jogadores.length === 0) return null;

    let html = `<div class="team-card-header">
        ${teamColorPill(team, 20)}
        <span class="team-card-name">${team.nome}</span>
        <span class="team-card-abbr">${team.sigla}</span>
    </div>
    <div class="team-card-players">`;

    jogadores.forEach(p => {
        const fotoHtml = p.foto
            ? `<img src="${p.foto}" alt="${p.apelido || p.nome}" class="player-avatar" onerror="this.style.display='none'">`
            : `<div class="player-avatar-placeholder">👤</div>`;
        html += `<div class="player-row">
            ${fotoHtml}
            <div class="player-info">
                <span class="player-nickname">${p.apelido || p.nome}</span>
                <span class="player-fullname">${p.nome}</span>
                <div class="player-tags">
                    ${p.nivel ? `<span class="player-tag">${p.nivel}</span>` : ''}
                    ${p.lane ? `<span class="player-tag tag-lane">${p.lane}</span>` : ''}
                </div>
            </div>
        </div>`;
    });

    html += '</div>';
    return html;
}

function findTeamByName(name) {
    return state.teams.find(t => t.nome === name);
}

const isMobile = () => window.innerWidth <= 640;

function bindTeamPopovers() {
    const popover = $('#team-popover');
    let hideTimeout = null;

    $$('.team-name-link').forEach(el => {
        // Desktop: hover
        el.addEventListener('mouseenter', (e) => {
            if (isMobile()) return;
            const team = findTeamByName(el.dataset.team);
            if (!team) return;
            const html = buildTeamCardHtml(team);
            if (!html) return;
            clearTimeout(hideTimeout);
            popover.innerHTML = html;
            popover.classList.remove('hidden');
            positionPopover(popover, el);
        });

        el.addEventListener('mouseleave', () => {
            if (isMobile()) return;
            hideTimeout = setTimeout(() => popover.classList.add('hidden'), 200);
        });

        // Mobile: click
        el.addEventListener('click', (e) => {
            if (!isMobile()) return;
            e.preventDefault();
            e.stopPropagation();
            const team = findTeamByName(el.dataset.team);
            if (!team) return;
            const html = buildTeamCardHtml(team);
            if (!html) { return; }
            $('#team-card-modal-body').innerHTML = html;
            $('#team-card-modal').classList.remove('hidden');
        });
    });

    // Keep popover open when hovering it
    popover.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
    popover.addEventListener('mouseleave', () => {
        hideTimeout = setTimeout(() => popover.classList.add('hidden'), 200);
    });
}

function positionPopover(popover, anchor) {
    const rect = anchor.getBoundingClientRect();
    const popH = popover.offsetHeight;
    const popW = popover.offsetWidth;

    let top = rect.bottom + window.scrollY + 6;
    let left = rect.left + window.scrollX;

    // Keep within viewport
    if (left + popW > window.innerWidth - 16) {
        left = window.innerWidth - popW - 16;
    }
    if (left < 8) left = 8;

    // If below viewport, show above
    if (top + popH > window.scrollY + window.innerHeight - 16) {
        top = rect.top + window.scrollY - popH - 6;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function renderAdminPanel() {
    $('#admin-champ-name').value = state.config.nome_campeonato || '';
    $('#admin-hide-name').checked = !!state.config.ocultar_nome;
    $('#admin-classified').value = state.config.classificados || 8;
    $('#admin-rules').value = state.config.regras || '';
    $('#admin-about').value = state.config.sobre || '';

    const datalist = $('#teams-datalist');
    if (datalist) datalist.innerHTML = state.teams.map(t => `<option value="${t.nome}">`).join('');

    const teamOptions = state.teams.map(t => `<option value="${t.nome}">${t.nome}</option>`).join('');
    $('#admin-match-home').innerHTML = '<option value="">Mandante</option>' + teamOptions;
    $('#admin-match-away').innerHTML = '<option value="">Visitante</option>' + teamOptions;

    let teamsHtml = '';
    state.teams.forEach(t => {
        const playerCount = (t.jogadores || []).length;
        const playerBadge = playerCount > 0 ? `<span class="badge badge-sm">${playerCount} jogador${playerCount > 1 ? 'es' : ''}</span>` : '';
        teamsHtml += `<div class="admin-list-item">
            ${teamColorPill(t, 20)}
            <span class="admin-item-label">${t.nome} <small>(${t.sigla})</small> ${playerBadge}</span>
            <button class="btn btn-secondary btn-sm admin-edit-team" data-id="${t.id}" title="Editar time">✏️</button>
            <button class="btn btn-secondary btn-sm admin-edit-players" data-id="${t.id}" title="Editar jogadores">👥</button>
            <button class="btn btn-danger btn-sm admin-delete-team" data-id="${t.id}">🗑️</button>
        </div>`;
    });
    $('#admin-teams-list').innerHTML = teamsHtml || '<p class="hint">Nenhum time cadastrado.</p>';
    $$('.admin-delete-team').forEach(btn => btn.addEventListener('click', () => deleteTeam(btn.dataset.id)));
    $$('.admin-edit-players').forEach(btn => btn.addEventListener('click', () => openEditPlayersModal(btn.dataset.id)));
    $$('.admin-edit-team').forEach(btn => btn.addEventListener('click', () => openEditTeamModal(btn.dataset.id)));

    const rounds = [...new Set(state.matches.map(m => m.rodada))].sort((a, b) => a - b);
    let matchesHtml = '';
    rounds.forEach(r => {
        matchesHtml += `<div class="admin-round-header">Rodada ${r}</div>`;
        state.matches
            .filter(m => m.rodada === r)
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
            .forEach(m => {
                const score = m.gols_mandante != null ? `${m.gols_mandante} × ${m.gols_visitante}` : 'vs';
                const dateStr = m.data_hora ? `<span class="admin-match-date">📅 ${formatDate(m.data_hora)}</span>` : '';
                matchesHtml += `<div class="admin-list-item">
                    <span class="admin-item-label">${m.mandante} <em>${score}</em> ${m.visitante} ${dateStr}</span>
                    <button class="btn btn-secondary btn-sm admin-edit-match" data-id="${m.id}" title="Editar partida">✏️</button>
                    <button class="btn btn-secondary btn-sm admin-edit-score" data-id="${m.id}" title="Editar placar">⚽</button>
                    <button class="btn btn-danger btn-sm admin-delete-match" data-id="${m.id}">🗑️</button>
                </div>`;
            });
    });
    $('#admin-matches-list').innerHTML = matchesHtml || '<p class="hint">Nenhuma partida cadastrada.</p>';
    $$('.admin-delete-match').forEach(btn => btn.addEventListener('click', () => deleteMatch(btn.dataset.id)));
    $$('.admin-edit-score').forEach(btn => btn.addEventListener('click', () => openEditScoreModal(btn.dataset.id)));
    $$('.admin-edit-match').forEach(btn => btn.addEventListener('click', () => openEditMatchModal(btn.dataset.id)));
}

// ─── Edit Match Modal (Admin) ─────────────────────────────────────────────────
function openEditMatchModal(matchId) {
    const m = state.matches.find(x => x.id === matchId);
    if (!m) return;
    state.editingMatchId = matchId;
    const teamOptions = state.teams.map(t => `<option value="${t.nome}">${t.nome}</option>`).join('');
    $('#edit-match-home-sel').innerHTML = teamOptions;
    $('#edit-match-away-sel').innerHTML = teamOptions;
    $('#edit-match-round').value = m.rodada || '';
    $('#edit-match-home-sel').value = m.mandante || '';
    $('#edit-match-away-sel').value = m.visitante || '';
    $('#edit-match-modal-date').value = m.data_hora || '';
    $('#edit-match-modal').classList.remove('hidden');
    $('#edit-match-round').focus();
}

function closeEditMatchModal() {
    $('#edit-match-modal').classList.add('hidden');
    state.editingMatchId = null;
}

async function saveEditMatch() {
    const id = state.editingMatchId;
    if (!id) return;
    const rodada = parseInt($('#edit-match-round').value);
    const mandante = $('#edit-match-home-sel').value;
    const visitante = $('#edit-match-away-sel').value;
    if (!rodada || !mandante || !visitante) { showToast('Preencha todos os campos.', 'error'); return; }
    if (mandante === visitante) { showToast('Mandante e visitante devem ser times diferentes.', 'error'); return; }
    try {
        await updateDoc(doc(db, 'jogos', id), {
            rodada, mandante, visitante,
            data_hora: $('#edit-match-modal-date').value || null,
        });
        closeEditMatchModal();
        showToast('Partida atualizada!');
    } catch (e) {
        showError('Erro ao atualizar partida: ' + e.message);
    }
}

// ─── Edit Score Modal ─────────────────────────────────────────────────────────
function openEditScoreModal(matchId) {
    const m = state.matches.find(x => x.id === matchId);
    if (!m) return;
    state.editingMatch = m;
    $('#edit-home-name').textContent = m.mandante;
    $('#edit-away-name').textContent = m.visitante;
    $('#edit-home-goals').value = m.gols_mandante != null ? m.gols_mandante : '';
    $('#edit-away-goals').value = m.gols_visitante != null ? m.gols_visitante : '';
    $('#edit-tiebreak').checked = !!m.tiebreak;
    $('#edit-match-date').value = m.data_hora || '';
    $('#edit-score-modal').classList.remove('hidden');
    $('#edit-home-goals').focus();
}

function closeEditScoreModal() {
    $('#edit-score-modal').classList.add('hidden');
    state.editingMatch = null;
}

async function saveEditScore() {
    const m = state.editingMatch;
    if (!m) return;
    const hg = $('#edit-home-goals').value;
    const ag = $('#edit-away-goals').value;
    const tb = $('#edit-tiebreak').checked;
    try {
        await updateDoc(doc(db, 'jogos', m.id), {
            gols_mandante: hg !== '' ? parseInt(hg) : null,
            gols_visitante: ag !== '' ? parseInt(ag) : null,
            tiebreak: tb,
            data_hora: $('#edit-match-date').value || null,
        });
        closeEditScoreModal();
        showToast('Placar salvo!');
    } catch (e) {
        showError('Erro ao salvar placar: ' + e.message);
    }
}

// ─── Edit Bracket Modal ───────────────────────────────────────────────────────
function openEditBracketModal(matchId) {
    const m = state.knockout.find(x => x.id === matchId);
    if (!m) return;
    state.editingBracket = m;
    $('#edit-bracket-team1').value = m.time1 || '';
    $('#edit-bracket-team2').value = m.time2 || '';
    $('#edit-bracket-goals1').value = m.gols1 != null ? m.gols1 : '';
    $('#edit-bracket-goals2').value = m.gols2 != null ? m.gols2 : '';
    $('#edit-bracket-pen1').value = m.pen1 != null ? m.pen1 : '';
    $('#edit-bracket-pen2').value = m.pen2 != null ? m.pen2 : '';
    $('#edit-bracket-date').value = m.data_hora || '';
    $('#edit-bracket-modal').classList.remove('hidden');
    $('#edit-bracket-team1').focus();
}

function closeEditBracketModal() {
    $('#edit-bracket-modal').classList.add('hidden');
    state.editingBracket = null;
}

async function saveEditBracket() {
    const m = state.editingBracket;
    if (!m) return;
    const g1 = $('#edit-bracket-goals1').value;
    const g2 = $('#edit-bracket-goals2').value;
    const p1 = $('#edit-bracket-pen1').value;
    const p2 = $('#edit-bracket-pen2').value;
    try {
        await updateDoc(doc(db, 'mata_mata', m.id), {
            time1: $('#edit-bracket-team1').value.trim(),
            time2: $('#edit-bracket-team2').value.trim(),
            gols1: g1 !== '' ? parseInt(g1) : null,
            gols2: g2 !== '' ? parseInt(g2) : null,
            pen1: p1 !== '' ? parseInt(p1) : null,
            pen2: p2 !== '' ? parseInt(p2) : null,
            data_hora: $('#edit-bracket-date').value || null,
        });
        closeEditBracketModal();
        showToast('Partida salva!');
    } catch (e) {
        showError('Erro ao salvar partida: ' + e.message);
    }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function adminLogin() {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const errorEl = $('#login-error');
    if (!email || !password) {
        errorEl.textContent = 'Preencha email e senha.';
        errorEl.classList.remove('hidden');
        return;
    }
    const submitBtn = $('#login-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';
    errorEl.classList.add('hidden');
    try {
        await signInWithEmailAndPassword(auth, email, password);
        closeLoginModal();
        showToast('Login realizado com sucesso!');
    } catch (e) {
        const msgs = {
            'auth/user-not-found': 'Usuário não encontrado.',
            'auth/wrong-password': 'Senha incorreta.',
            'auth/invalid-email': 'Email inválido.',
            'auth/invalid-credential': 'Email ou senha incorretos.',
            'auth/too-many-requests': 'Muitas tentativas. Tente mais tarde.',
        };
        errorEl.textContent = msgs[e.code] || 'Erro ao fazer login.';
        errorEl.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Entrar';
    }
}

function openLoginModal() {
    $('#login-email').value = '';
    $('#login-password').value = '';
    $('#login-error').classList.add('hidden');
    $('#login-modal').classList.remove('hidden');
    setTimeout(() => $('#login-email').focus(), 50);
}

function closeLoginModal() {
    $('#login-modal').classList.add('hidden');
}

function setAdminMode(isAdmin) {
    state.isAdmin = isAdmin;
    $('#admin-login-btn').classList.toggle('hidden', isAdmin);
    $('#admin-logout-btn').classList.toggle('hidden', !isAdmin);
    $('#admin-tab-btn').classList.toggle('hidden', !isAdmin);
    if (!isAdmin && $('.nav-tab.active')?.dataset.tab === 'admin') {
        showTab('classificacao');
    }
    if (Object.values(state.dataReady).every(Boolean)) {
        const hasData = state.teams.length > 0 || state.matches.length > 0 || state.config.nome_campeonato;
        if (isAdmin || hasData) {
            $('#setup-message').classList.add('hidden');
            renderAll();
        } else {
            $('#setup-message').classList.remove('hidden');
        }
    }
}

// ─── Firestore CRUD ───────────────────────────────────────────────────────────
async function saveConfig() {
    const name = $('#admin-champ-name').value.trim();
    const classified = parseInt($('#admin-classified').value) || 8;
    const hideName = $('#admin-hide-name').checked;
    const regras = state.config.regras || '';
    try {
        await setDoc(doc(db, 'config', 'main'), { nome_campeonato: name, classificados: classified, ocultar_nome: hideName, regras });
        showToast('Configurações salvas!');
    } catch (e) {
        showError('Erro ao salvar configurações: ' + e.message);
    }
}

async function saveRules() {
    const regras = $('#admin-rules').value;
    try {
        await setDoc(doc(db, 'config', 'main'), { ...state.config, regras });
        showToast('Regras salvas!');
    } catch (e) {
        showError('Erro ao salvar regras: ' + e.message);
    }
}

async function saveAbout() {
    const sobre = $('#admin-about').value;
    try {
        await setDoc(doc(db, 'config', 'main'), { ...state.config, sobre });
        showToast('Sobre salvo!');
    } catch (e) {
        showError('Erro ao salvar sobre: ' + e.message);
    }
}

// ─── Edit Team Modal ──────────────────────────────────────────────────────────
function openEditTeamModal(teamId) {
    const t = state.teams.find(x => x.id === teamId);
    if (!t) return;
    state.editingTeamId = teamId;
    $('#edit-team-name').value = t.nome || '';
    $('#edit-team-abbr').value = t.sigla || '';
    const cores = t.cores || (t.cor ? [t.cor, t.cor, t.cor] : ['#3fb950', '#3fb950', '#3fb950']);
    $('#edit-team-color1').value = cores[0] || '#3fb950';
    $('#edit-team-color2').value = cores[1] || cores[0] || '#3fb950';
    $('#edit-team-color3').value = cores[2] || cores[0] || '#3fb950';
    $('#edit-team-modal').classList.remove('hidden');
    $('#edit-team-name').focus();
}

function closeEditTeamModal() {
    $('#edit-team-modal').classList.add('hidden');
    state.editingTeamId = null;
}

async function saveEditTeam() {
    const teamId = state.editingTeamId;
    if (!teamId) return;
    const nome = $('#edit-team-name').value.trim();
    const sigla = $('#edit-team-abbr').value.trim().toUpperCase();
    if (!nome || !sigla) { showToast('Preencha nome e sigla.', 'error'); return; }
    const c1 = $('#edit-team-color1').value;
    const c2 = $('#edit-team-color2').value;
    const c3 = $('#edit-team-color3').value;
    const cores = [c1];
    if (c2 !== c1) cores.push(c2);
    if (c3 !== c1 && c3 !== c2) cores.push(c3);
    try {
        await updateDoc(doc(db, 'times', teamId), { nome, sigla, cor: c1, cores });
        closeEditTeamModal();
        showToast('Time atualizado!');
    } catch (e) {
        showError('Erro ao atualizar time: ' + e.message);
    }
}

async function addTeam() {
    const nome = $('#admin-team-name').value.trim();
    const sigla = $('#admin-team-abbr').value.trim().toUpperCase();
    const c1 = $('#admin-team-color1').value;
    const c2 = $('#admin-team-color2').value;
    const c3 = $('#admin-team-color3').value;
    // Deduplicate: only add extra colors if they differ from previous
    const cores = [c1];
    if (c2 !== c1) cores.push(c2);
    if (c3 !== c1 && c3 !== c2) cores.push(c3);
    const cor = c1; // keep primary color for legacy compatibility
    if (!nome || !sigla) { showToast('Preencha nome e sigla do time.', 'error'); return; }
    try {
        await addDoc(collection(db, 'times'), { nome, sigla, cor, cores, jogadores: [] });
        $('#admin-team-name').value = '';
        $('#admin-team-abbr').value = '';
        showToast(`Time "${nome}" adicionado!`);
    } catch (e) {
        showError('Erro ao adicionar time: ' + e.message);
    }
}

async function deleteTeam(id) {
    if (!confirm('Excluir este time?')) return;
    try {
        await deleteDoc(doc(db, 'times', id));
        showToast('Time excluído.', 'info');
    } catch (e) {
        showError('Erro ao excluir time: ' + e.message);
    }
}

// ─── Edit Players Modal ──────────────────────────────────────────────────────
function openEditPlayersModal(teamId) {
    const team = state.teams.find(t => t.id === teamId);
    if (!team) return;
    state.editingTeamId = teamId;
    $('#edit-players-team-name').textContent = team.nome;

    const jogadores = team.jogadores || [];
    let html = '';
    for (let i = 0; i < 3; i++) {
        const p = jogadores[i] || {};
        const fotoPreview = p.foto
            ? `<img src="${p.foto}" class="player-foto-preview" alt="foto">`
            : `<div class="player-foto-preview player-foto-empty">👤</div>`;
        html += `<div class="player-edit-card">
            <h4>Jogador ${i + 1}</h4>
            <div class="player-edit-fields">
                <div class="player-edit-field player-foto-field">
                    <label>Foto:</label>
                    <div class="player-foto-upload">
                        ${fotoPreview}
                        <label class="btn btn-secondary btn-sm upload-btn">
                            📷 Escolher foto
                            <input type="file" class="player-foto-input" data-idx="${i}" accept="image/*" style="display:none">
                        </label>
                        ${p.foto ? `<button class="btn btn-danger btn-sm player-foto-remove" data-idx="${i}">🗑️</button>` : ''}
                    </div>
                    <input type="hidden" class="player-foto" data-idx="${i}" value="${p.foto || ''}">
                </div>
                <div class="player-edit-field">
                    <label>Nome Completo:</label>
                    <input type="text" class="player-nome" data-idx="${i}" value="${p.nome || ''}" placeholder="Nome completo">
                </div>
                <div class="player-edit-field">
                    <label>Apelido:</label>
                    <input type="text" class="player-apelido" data-idx="${i}" value="${p.apelido || ''}" placeholder="Apelido">
                </div>
                <div class="player-edit-row-inline">
                    <div class="player-edit-field">
                        <label>Nível:</label>
                        <input type="text" class="player-nivel" data-idx="${i}" value="${p.nivel || ''}" placeholder="Ex: Avançado">
                    </div>
                    <div class="player-edit-field">
                        <label>Lane:</label>
                        <input type="text" class="player-lane" data-idx="${i}" value="${p.lane || ''}" placeholder="Ex: Mid">
                    </div>
                </div>
            </div>
        </div>`;
    }
    $('#edit-players-list').innerHTML = html;

    // Wire up file inputs for preview
    $$('.player-foto-input').forEach(input => {
        input.addEventListener('change', () => handlePhotoPreview(input));
    });
    $$('.player-foto-remove').forEach(btn => {
        btn.addEventListener('click', () => handlePhotoRemove(btn.dataset.idx));
    });

    $('#edit-players-modal').classList.remove('hidden');
}

function handlePhotoPreview(input) {
    const file = input.files[0];
    if (!file) return;
    const card = input.closest('.player-edit-card');
    const wrap = card.querySelector('.player-foto-upload');
    const hiddenInput = card.querySelector('.player-foto');
    input.value = ''; // reset so same file can be re-selected
    openCropModal(file, hiddenInput, wrap);
}

function handlePhotoRemove(idx) {
    const inputs = $$('.player-foto-input');
    const card = inputs[idx]?.closest('.player-edit-card');
    if (!card) return;
    const wrap = card.querySelector('.player-foto-upload');
    const preview = wrap.querySelector('.player-foto-preview');
    if (preview) {
        preview.outerHTML = `<div class="player-foto-preview player-foto-empty">👤</div>`;
    }
    card.querySelector('.player-foto').value = '__remove__';
    const removeBtn = wrap.querySelector('.player-foto-remove');
    if (removeBtn) removeBtn.remove();
}

function closeEditPlayersModal() {
    $('#edit-players-modal').classList.add('hidden');
    state.editingTeamId = null;
}

async function savePlayersModal() {
    const teamId = state.editingTeamId;
    if (!teamId) return;

    const saveBtn = $('#edit-players-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    try {
        const jogadores = [];
        for (let i = 0; i < 3; i++) {
            const fotoHidden = $$('.player-foto')[i];
            const nome = ($$('.player-nome')[i]?.value || '').trim();
            const apelido = ($$('.player-apelido')[i]?.value || '').trim();
            const nivel = ($$('.player-nivel')[i]?.value || '').trim();
            const lane = ($$('.player-lane')[i]?.value || '').trim();

            let fotoUrl = fotoHidden?.value || '';
            if (fotoUrl === '__remove__') fotoUrl = '';

            if (nome || apelido) {
                jogadores.push({ foto: fotoUrl, nome, apelido, nivel, lane });
            }
        }

        await updateDoc(doc(db, 'times', teamId), { jogadores });
        closeEditPlayersModal();
        showToast('Jogadores salvos!');
    } catch (e) {
        showError('Erro ao salvar jogadores: ' + e.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar';
    }
}

async function addMatch() {
    const rodada = parseInt($('#admin-match-round').value);
    const mandante = $('#admin-match-home').value;
    const visitante = $('#admin-match-away').value;
    if (!rodada || !mandante || !visitante) { showToast('Preencha rodada, mandante e visitante.', 'error'); return; }
    if (mandante === visitante) { showToast('Mandante e visitante devem ser times diferentes.', 'error'); return; }
    const ordem = state.matches.filter(m => m.rodada === rodada).length;
    try {
        await addDoc(collection(db, 'jogos'), {
            rodada, mandante, visitante,
            gols_mandante: null, gols_visitante: null, ordem,
            data_hora: $('#admin-match-date').value || null,
        });
        $('#admin-match-round').value = '';
        $('#admin-match-date').value = '';
        showToast('Partida adicionada!');
    } catch (e) {
        showError('Erro ao adicionar partida: ' + e.message);
    }
}

async function deleteMatch(id) {
    if (!confirm('Excluir esta partida?')) return;
    try {
        await deleteDoc(doc(db, 'jogos', id));
        showToast('Partida excluída.', 'info');
    } catch (e) {
        showError('Erro ao excluir partida: ' + e.message);
    }
}

async function initBracket() {
    if (state.knockout.length > 0 && !confirm('Já existe um bracket. Deseja recriar?')) return;
    const structure = [
        ...Array(4).fill(null).map((_, i) => ({ fase: 'quartas', ordem: i, time1: '', time2: '', gols1: null, gols2: null, pen1: null, pen2: null })),
        ...Array(2).fill(null).map((_, i) => ({ fase: 'semis', ordem: i, time1: '', time2: '', gols1: null, gols2: null, pen1: null, pen2: null })),
        { fase: 'final', ordem: 0, time1: '', time2: '', gols1: null, gols2: null, pen1: null, pen2: null },
    ];
    try {
        const batch = writeBatch(db);
        state.knockout.forEach(m => batch.delete(doc(db, 'mata_mata', m.id)));
        structure.forEach(s => batch.set(doc(collection(db, 'mata_mata')), s));
        await batch.commit();
        showToast('Bracket criado! Edite cada partida na aba Mata-Mata.', 'info', 5000);
    } catch (e) {
        showError('Erro ao inicializar bracket: ' + e.message);
    }
}

async function generateRoundRobin() {
    const teams = [...state.teams];
    if (teams.length < 2) { showToast('Cadastre pelo menos 2 times antes de gerar as rodadas.', 'error'); return; }
    if (state.matches.length > 0 && !confirm(`Já existem ${state.matches.length} partidas cadastradas. Deseja apagar tudo e gerar novamente?`)) return;

    // Circle algorithm: if odd number of teams, add a "bye" placeholder
    const list = teams.length % 2 === 0 ? [...teams] : [...teams, null];
    const n = list.length;
    const numRounds = n - 1;
    const matchesPerRound = n / 2;

    const fixtures = [];
    const rotation = list.slice(1); // all except the fixed first element

    for (let round = 0; round < numRounds; round++) {
        const roundTeams = [list[0], ...rotation];
        for (let i = 0; i < matchesPerRound; i++) {
            const home = roundTeams[i];
            const away = roundTeams[n - 1 - i];
            // skip bye matches
            if (home && away) {
                fixtures.push({
                    rodada: round + 1,
                    mandante: home.nome,
                    visitante: away.nome,
                    gols_mandante: null,
                    gols_visitante: null,
                    ordem: i,
                });
            }
        }
        // rotate: move last element to front of rotation
        rotation.unshift(rotation.pop());
    }

    try {
        const batch = writeBatch(db);
        state.matches.forEach(m => batch.delete(doc(db, 'jogos', m.id)));
        // Firestore batch limit is 500 ops; split if needed
        const chunkSize = 490;
        for (let i = 0; i < fixtures.length; i += chunkSize) {
            const chunk = fixtures.slice(i, i + chunkSize);
            if (i === 0) {
                chunk.forEach(f => batch.set(doc(collection(db, 'jogos')), f));
                await batch.commit();
            } else {
                const b2 = writeBatch(db);
                chunk.forEach(f => b2.set(doc(collection(db, 'jogos')), f));
                await b2.commit();
            }
        }
        showToast(`${fixtures.length} partidas geradas em ${numRounds} rodadas!`, 'success', 5000);
        state.roundInitialized = false;
        showTab('jogos');
    } catch (e) {
        showError('Erro ao gerar rodadas: ' + e.message);
    }
}

// ─── Firestore Listeners ──────────────────────────────────────────────────────
function setupListeners() {
    let firstRender = true;
    const ready = () => Object.values(state.dataReady).every(Boolean);

    const afterUpdate = (bracketOnly = false) => {
        if (!ready()) { onDataUpdate(); return; }
        showLoading(false);
        $('#setup-message').classList.add('hidden');
        calculateStandings();
        // Always do a full render on the first time all data is ready
        if (firstRender || !bracketOnly) {
            firstRender = false;
            renderAll();
        } else {
            renderBracket();
            if (state.isAdmin) renderAdminPanel();
        }
    };

    onSnapshot(doc(db, 'config', 'main'), snap => {
        state.config = snap.exists() ? snap.data() : {};
        state.dataReady.config = true;
        afterUpdate();
    }, err => { console.error(err); state.dataReady.config = true; onDataUpdate(); });

    onSnapshot(collection(db, 'times'), snap => {
        state.teams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.dataReady.teams = true;
        afterUpdate();
    }, err => { console.error(err); state.dataReady.teams = true; onDataUpdate(); });

    onSnapshot(collection(db, 'jogos'), snap => {
        state.matches = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.rodada - b.rodada) || ((a.ordem || 0) - (b.ordem || 0)));
        state.dataReady.matches = true;
        afterUpdate();
    }, err => { console.error(err); state.dataReady.matches = true; onDataUpdate(); });

    onSnapshot(collection(db, 'mata_mata'), snap => {
        const order = { quartas: 0, semis: 1, final: 2 };
        state.knockout = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (order[a.fase] - order[b.fase]) || ((a.ordem || 0) - (b.ordem || 0)));
        state.dataReady.knockout = true;
        afterUpdate(true);
    }, err => { console.error(err); state.dataReady.knockout = true; onDataUpdate(); });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
    applyTheme(state.theme);

    $('#theme-toggle').addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));

    $$('.nav-tab').forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

    // Swipe between tabs on mobile
    const visibleTabs = () => Array.from($$('.nav-tab:not(.hidden)')).map(t => t.dataset.tab);
    let swipeStartX = 0, swipeStartY = 0;
    document.addEventListener('touchstart', e => {
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - swipeStartX;
        const dy = e.changedTouches[0].clientY - swipeStartY;
        if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return; // ignore short/vertical
        const tabs = visibleTabs();
        const current = $('.nav-tab.active')?.dataset.tab;
        const idx = tabs.indexOf(current);
        if (dx < 0 && idx < tabs.length - 1) showTab(tabs[idx + 1]);
        else if (dx > 0 && idx > 0) showTab(tabs[idx - 1]);
    }, { passive: true });

    $('#admin-login-btn').addEventListener('click', openLoginModal);
    $('#admin-logout-btn').addEventListener('click', () => signOut(auth));
    $('#setup-btn').addEventListener('click', openLoginModal);

    $('#login-submit').addEventListener('click', adminLogin);
    $('#login-cancel').addEventListener('click', closeLoginModal);
    $('#login-modal').querySelector('.modal-overlay').addEventListener('click', closeLoginModal);
    $('#login-password').addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });

    $('#edit-match-save').addEventListener('click', saveEditMatch);
    $('#edit-match-cancel').addEventListener('click', closeEditMatchModal);
    $('#edit-match-modal').querySelector('.modal-overlay').addEventListener('click', closeEditMatchModal);

    $('#edit-score-save').addEventListener('click', saveEditScore);
    $('#edit-score-clear').addEventListener('click', async () => {
        const m = state.editingMatch;
        if (!m) return;
        try {
            await updateDoc(doc(db, 'jogos', m.id), { gols_mandante: null, gols_visitante: null, tiebreak: false });
            closeEditScoreModal();
            showToast('Placar limpo.', 'info');
        } catch (e) { showError(e.message); }
    });
    $('#edit-score-cancel').addEventListener('click', closeEditScoreModal);
    $('#edit-score-modal').querySelector('.modal-overlay').addEventListener('click', closeEditScoreModal);

    $('#edit-bracket-save').addEventListener('click', saveEditBracket);
    $('#edit-bracket-clear').addEventListener('click', async () => {
        const m = state.editingBracket;
        if (!m) return;
        try {
            await updateDoc(doc(db, 'mata_mata', m.id), { time1: '', time2: '', gols1: null, gols2: null, pen1: null, pen2: null });
            closeEditBracketModal();
            showToast('Partida limpa.', 'info');
        } catch (e) { showError(e.message); }
    });
    $('#edit-bracket-cancel').addEventListener('click', closeEditBracketModal);
    $('#edit-bracket-modal').querySelector('.modal-overlay').addEventListener('click', closeEditBracketModal);

    $('#edit-players-save').addEventListener('click', savePlayersModal);
    $('#edit-players-cancel').addEventListener('click', closeEditPlayersModal);
    $('#edit-players-modal').querySelector('.modal-overlay').addEventListener('click', closeEditPlayersModal);

    $('#edit-team-save').addEventListener('click', saveEditTeam);
    $('#edit-team-cancel').addEventListener('click', closeEditTeamModal);
    $('#edit-team-modal').querySelector('.modal-overlay').addEventListener('click', closeEditTeamModal);

    $('#edit-match-save').addEventListener('click', saveEditMatch);
    $('#edit-match-cancel').addEventListener('click', closeEditMatchModal);
    $('#edit-match-modal').querySelector('.modal-overlay').addEventListener('click', closeEditMatchModal);

    // Crop modal
    $('#crop-confirm').addEventListener('click', confirmCrop);
    $('#crop-cancel').addEventListener('click', closeCropModal);
    $('#crop-modal').querySelector('.modal-overlay').addEventListener('click', closeCropModal);
    const cropCanvas = $('#crop-canvas');
    cropCanvas.width = CROP_SIZE; cropCanvas.height = CROP_SIZE;
    cropCanvas.addEventListener('mousedown', e => { crop.dragging = true; crop.lastX = e.clientX; crop.lastY = e.clientY; });
    cropCanvas.addEventListener('mousemove', e => {
        if (!crop.dragging || !crop.img) return;
        crop.ox += e.clientX - crop.lastX; crop.oy += e.clientY - crop.lastY;
        crop.lastX = e.clientX; crop.lastY = e.clientY;
        cropClamp(); drawCrop();
    });
    cropCanvas.addEventListener('mouseup', () => { crop.dragging = false; });
    cropCanvas.addEventListener('mouseleave', () => { crop.dragging = false; });
    cropCanvas.addEventListener('wheel', e => { e.preventDefault(); if (!crop.img) return; cropZoom(e.deltaY < 0 ? 1.1 : 0.9, CROP_SIZE / 2, CROP_SIZE / 2); }, { passive: false });
    cropCanvas.addEventListener('touchstart', e => {
        e.preventDefault();
        if (e.touches.length === 1) { crop.dragging = true; crop.lastX = e.touches[0].clientX; crop.lastY = e.touches[0].clientY; }
        else if (e.touches.length === 2) { crop.dragging = false; const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY; crop.pinchDist = Math.sqrt(dx*dx + dy*dy); }
    }, { passive: false });
    cropCanvas.addEventListener('touchmove', e => {
        e.preventDefault(); if (!crop.img) return;
        if (e.touches.length === 1 && crop.dragging) {
            crop.ox += e.touches[0].clientX - crop.lastX; crop.oy += e.touches[0].clientY - crop.lastY;
            crop.lastX = e.touches[0].clientX; crop.lastY = e.touches[0].clientY;
            cropClamp(); drawCrop();
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            cropZoom(dist / crop.pinchDist, CROP_SIZE / 2, CROP_SIZE / 2);
            crop.pinchDist = dist;
        }
    }, { passive: false });
    cropCanvas.addEventListener('touchend', e => { if (e.touches.length === 0) crop.dragging = false; });

    $('#team-card-modal').querySelector('.modal-overlay').addEventListener('click', () => $('#team-card-modal').classList.add('hidden'));

    $('#admin-save-config').addEventListener('click', saveConfig);
    $('#admin-save-rules').addEventListener('click', saveRules);
    $('#admin-save-about').addEventListener('click', saveAbout);
    $('#admin-add-team').addEventListener('click', addTeam);
    $('#admin-add-match').addEventListener('click', addMatch);
    $('#admin-init-bracket').addEventListener('click', initBracket);
    $('#admin-generate-rounds').addEventListener('click', generateRoundRobin);

    // Logo lightbox
    const lightbox = $('#logo-lightbox');
    $('#header-logo-btn').addEventListener('click', () => lightbox.classList.remove('hidden'));
    lightbox.addEventListener('click', () => lightbox.classList.add('hidden'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') lightbox.classList.add('hidden'); });

    // Abbreviation legend toggle (click on mobile, hover handled by CSS on desktop)
    const abbrToggle = $('#abbr-legend-toggle');
    if (abbrToggle) {
        abbrToggle.addEventListener('click', e => {
            e.stopPropagation();
            const open = abbrToggle.classList.toggle('open');
            abbrToggle.setAttribute('aria-expanded', open);
        });
        document.addEventListener('click', e => {
            if (!abbrToggle.contains(e.target)) {
                abbrToggle.classList.remove('open');
                abbrToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    $('#prev-round').addEventListener('click', () => {
        if (state.currentRound > 1) { state.currentRound--; renderMatches(); }
    });
    $('#next-round').addEventListener('click', () => {
        if (state.currentRound < state.totalRounds) { state.currentRound++; renderMatches(); }
    });

    $('#refresh-btn').addEventListener('click', () => {
        if (Object.values(state.dataReady).every(Boolean)) { calculateStandings(); renderAll(); }
    });

    $('#error-close').addEventListener('click', hideError);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeLoginModal(); closeEditScoreModal(); closeEditBracketModal();
            closeEditPlayersModal();
            $('#team-card-modal').classList.add('hidden');
            $('#team-popover').classList.add('hidden');
        }
    });

    onAuthStateChanged(auth, user => setAdminMode(!!user));

    showLoading(true);
    setupListeners();
}

init();
