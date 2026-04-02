// app.js — Championship Dashboard powered by Firebase

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {
    getFirestore, collection, doc,
    setDoc, addDoc, updateDoc, deleteDoc,
    onSnapshot, writeBatch, getDocs,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';
import {
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword,
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
    matchDates: [],
    standings: [],
    currentRound: 1,
    totalRounds: 0,
    roundInitialized: false,
    theme: localStorage.getItem('theme') || 'dark',
    dataReady: { config: false, teams: false, matches: false, knockout: false, matchDates: false },
    editingMatch: null,
    editingMatchId: null,
    editingBracket: null,
    editingTeamId: null,
    userEmail: null,
    userRole: null,
    userPermissions: [],
    roles: [],
    usuarios: [],
};

// ─── Permissions ──────────────────────────────────────────────────────────────
const ALL_PERMISSIONS = [
    { key: 'config.edit', label: 'Editar configurações' },
    { key: 'about.edit', label: 'Editar sobre o campeonato' },
    { key: 'rules.edit', label: 'Editar regras' },
    { key: 'teams.add', label: 'Adicionar times' },
    { key: 'teams.edit', label: 'Editar times' },
    { key: 'teams.delete', label: 'Excluir times' },
    { key: 'players.edit', label: 'Editar jogadores' },
    { key: 'matches.add', label: 'Adicionar partidas' },
    { key: 'matches.edit', label: 'Editar partidas' },
    { key: 'matches.score', label: 'Editar placar' },
    { key: 'matches.delete', label: 'Excluir partidas' },
    { key: 'matches.generate', label: 'Gerar rodadas' },
    { key: 'bracket.init', label: 'Inicializar mata-mata' },
    { key: 'bracket.score', label: 'Editar placar mata-mata' },
    { key: 'backup.export', label: 'Exportar dados' },
    { key: 'backup.import', label: 'Importar dados' },
    { key: 'users.manage', label: 'Gerenciar usuários' },
    { key: 'roles.manage', label: 'Gerenciar roles' },
];

function hasPerm(perm) {
    return state.userPermissions.includes(perm);
}

function hasAnyPerm(...perms) {
    return perms.some(p => state.userPermissions.includes(p));
}

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

// ─── Match Dates helper ───────────────────────────────────────────────────────
function getMatchDate(rodada, ordem) {
    const key = `R${rodada}_O${ordem}`;
    const entry = state.matchDates.find(d => d.id === key);
    return entry ? entry.data_hora : null;
}

function getMatchDateForMatch(m) {
    return getMatchDate(m.rodada, m.ordem ?? 0) || m.data_hora || null;
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
    const totalPlayed = state.matches.filter(m => m.gols_mandante != null).length;
    $('#matches-played-badge').textContent = `${totalPlayed}/${state.matches.length} jogos`;

    const totalRounds = state.matches.length > 0
        ? Math.max(...state.matches.map(m => m.rodada || 0))
        : 0;
    if (totalRounds > 0) {
        const currentRound = findCurrentRound();
        const roundBadge = $('#current-round-badge');
        roundBadge.textContent = `Rodada ${currentRound} de ${totalRounds}`;
        roundBadge.classList.remove('hidden');
    }

    const numTeams = state.standings.length;
    // Zone boundaries: top 4 = direct quartas, 5-12 = play-in, 13+ = eliminated
    const directQualify = Math.min(4, numTeams);
    const playinEnd = Math.min(12, numTeams);

    let html = '';
    state.standings.forEach((t, i) => {
        const pos = i + 1;
        const gd = t.gf - t.ga;
        const gdSign = gd > 0 ? '+' : '';
        const gdClass = gd > 0 ? 'sg-positive' : gd < 0 ? 'sg-negative' : '';

        let rowClass = '';
        if (pos <= directQualify) {
            rowClass = 'qualify';
            if (pos === directQualify) rowClass += ' qualify-border';
        } else if (pos <= playinEnd) {
            rowClass = 'playin-zone';
            if (pos === playinEnd) rowClass += ' playin-border';
        } else {
            rowClass = 'eliminated-zone';
        }

        html += `<tr class="${rowClass}">
            <td class="col-pos">${pos}</td>
            <td class="col-team">
                ${teamColorPill(t, 16)}
                <span class="team-name-link" data-team="${t.name}" style="margin-left:6px">${t.name}</span>
            </td>
            <td class="col-stat-pts">${t.pts}</td>
            <td>${t.played}</td>
            <td>${t.wins}</td>
            <td class="col-hide-mobile">${t.tbWins}</td>
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
        const matchDate = getMatchDateForMatch(m);
        const dateInfo = matchDate
            ? `<div class="match-date-info">📅 ${formatDate(matchDate)}</div>`
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
            ${!played ? dateInfo : (matchDate ? `<div class="match-date-info">📅 ${formatDate(matchDate)}</div>` : '')}
            ${hasPerm('matches.score') ? `<button class="edit-match-btn" data-id="${m.id}" title="Editar placar">✏️ editar</button>` : ''}
        </div>`;
    });

    $('#matches-container').innerHTML = html;

    if (hasPerm('matches.score')) {
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
    const phases = ['playin', 'quartas', 'semis', 'final'];
    const phaseLabels = { playin: 'Play In', quartas: 'Quartas de Final', semis: 'Semifinais', final: 'Final' };
    const defaultCounts = { playin: 4, quartas: 4, semis: 2, final: 1 };

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

    // Always show play-in phase in the bracket
    const activePhases = phases;

    const playinHints = [
        '5° vs 12°', '6° vs 11°', '7° vs 10°', '8° vs 9°',
    ];

    let html = '';
    activePhases.forEach(phase => {
        const matches = state.knockout
            .filter(m => m.fase === phase)
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        html += `<div class="bracket-round${phase === 'playin' ? ' bracket-round-playin' : ''}">
            <div class="bracket-round-title">${phaseLabels[phase] || phase}</div>
            ${phase === 'playin' ? '<p class="bracket-playin-hint">5°×12° &nbsp;·&nbsp; 6°×11° &nbsp;·&nbsp; 7°×10° &nbsp;·&nbsp; 8°×9°</p>' : ''}
            ${phase === 'quartas' ? '<p class="bracket-playin-hint">1°–4° (direto) vs vencedores Play In (reordenados)</p>' : ''}
            <div class="bracket-matches">`;
        if (matches.length === 0) {
            const count = defaultCounts[phase] || 1;
            for (let i = 0; i < count; i++) {
                html += renderBracketMatch({ id: null, time1: '', time2: '', gols1: null, gols2: null, pen1: null, pen2: null });
            }
        } else {
            matches.forEach(m => { html += renderBracketMatch(m); });
        }
        html += `</div></div>`;
    });

    $('#bracket-container').innerHTML = html;

    if (hasPerm('bracket.score')) {
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
    const editBtn = hasPerm('bracket.score') && m.id
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
            const dateA = getMatchDateForMatch(a);
            const dateB = getMatchDateForMatch(b);
            if (dateA && dateB) return new Date(dateA) - new Date(dateB);
            if (dateA) return -1;
            if (dateB) return 1;
            return (a.rodada - b.rodada) || ((a.ordem || 0) - (b.ordem || 0));
        })
        .slice(0, 3);

    if (upcoming.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    list.innerHTML = upcoming.map(m => {
        const ht = teamMap[m.mandante] || { cor: '#888' };
        const at = teamMap[m.visitante] || { cor: '#888' };
        const matchDate = getMatchDateForMatch(m);
        const dateStr = matchDate ? formatDate(matchDate) : '📅 A definir';
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
    // Show/hide admin sections based on permissions
    const sectionMap = {
        'admin-section-config': 'config.edit',
        'admin-section-about': 'about.edit',
        'admin-section-rules': 'rules.edit',
        'admin-section-teams': ['teams.add', 'teams.edit', 'teams.delete', 'players.edit'],
        'admin-section-matches': ['matches.add', 'matches.edit', 'matches.score', 'matches.delete', 'matches.generate'],
        'admin-section-bracket': ['bracket.init', 'bracket.score'],
        'admin-section-backup': ['backup.export', 'backup.import'],
        'admin-section-users': 'users.manage',
        'admin-section-roles': 'roles.manage',
    };
    Object.entries(sectionMap).forEach(([sectionId, perms]) => {
        const el = $(`#${sectionId}`);
        if (!el) return;
        const visible = Array.isArray(perms) ? perms.some(p => hasPerm(p)) : hasPerm(perms);
        el.classList.toggle('hidden', !visible);
    });

    if (hasPerm('config.edit')) {
        $('#admin-champ-name').value = state.config.nome_campeonato || '';
        $('#admin-hide-name').checked = !!state.config.ocultar_nome;
    }
    if (hasPerm('rules.edit')) {
        $('#admin-rules').value = state.config.regras || '';
    }
    if (hasPerm('about.edit')) {
        $('#admin-about').value = state.config.sobre || '';
    }

    const datalist = $('#teams-datalist');
    if (datalist) datalist.innerHTML = state.teams.map(t => `<option value="${t.nome}">`).join('');

    // Show/hide add forms based on permissions
    const addTeamForm = $('#admin-add-team-form');
    if (addTeamForm) addTeamForm.classList.toggle('hidden', !hasPerm('teams.add'));
    const addMatchForm = $('#admin-add-match-form');
    if (addMatchForm) addMatchForm.classList.toggle('hidden', !hasPerm('matches.add'));
    const genRow = $('#admin-generate-row');
    if (genRow) genRow.classList.toggle('hidden', !hasPerm('matches.generate'));

    const teamOptions = state.teams.map(t => `<option value="${t.nome}">${t.nome}</option>`).join('');
    if ($('#admin-match-home')) {
        $('#admin-match-home').innerHTML = '<option value="">Mandante</option>' + teamOptions;
        $('#admin-match-away').innerHTML = '<option value="">Visitante</option>' + teamOptions;
    }

    if (hasAnyPerm('teams.add', 'teams.edit', 'teams.delete', 'players.edit')) {
        let teamsHtml = '';
        state.teams.forEach(t => {
            const playerCount = (t.jogadores || []).length;
            const playerBadge = playerCount > 0 ? `<span class="badge badge-sm">${playerCount} jogador${playerCount > 1 ? 'es' : ''}</span>` : '';
            const editBtn = hasPerm('teams.edit') ? `<button class="btn btn-secondary btn-sm admin-edit-team" data-id="${t.id}" title="Editar time">✏️</button>` : '';
            const playersBtn = hasPerm('players.edit') ? `<button class="btn btn-secondary btn-sm admin-edit-players" data-id="${t.id}" title="Editar jogadores">👥</button>` : '';
            const deleteBtn = hasPerm('teams.delete') ? `<button class="btn btn-danger btn-sm admin-delete-team" data-id="${t.id}">🗑️</button>` : '';
            teamsHtml += `<div class="admin-list-item">
                ${teamColorPill(t, 20)}
                <span class="admin-item-label">${t.nome} <small>(${t.sigla})</small> ${playerBadge}</span>
                ${editBtn}${playersBtn}${deleteBtn}
            </div>`;
        });
        $('#admin-teams-list').innerHTML = teamsHtml || '<p class="hint">Nenhum time cadastrado.</p>';
        $$('.admin-delete-team').forEach(btn => btn.addEventListener('click', () => deleteTeam(btn.dataset.id)));
        $$('.admin-edit-players').forEach(btn => btn.addEventListener('click', () => openEditPlayersModal(btn.dataset.id)));
        $$('.admin-edit-team').forEach(btn => btn.addEventListener('click', () => openEditTeamModal(btn.dataset.id)));
    }

    if (hasAnyPerm('matches.add', 'matches.edit', 'matches.score', 'matches.delete')) {
        const rounds = [...new Set(state.matches.map(m => m.rodada))].sort((a, b) => a - b);
        let matchesHtml = '';
        rounds.forEach(r => {
            matchesHtml += `<div class="admin-round-header">Rodada ${r}</div>`;
            state.matches
                .filter(m => m.rodada === r)
                .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
                .forEach(m => {
                    const score = m.gols_mandante != null ? `${m.gols_mandante} × ${m.gols_visitante}` : 'vs';
                    const matchDate = getMatchDateForMatch(m);
                    const dateStr = matchDate ? `<span class="admin-match-date">📅 ${formatDate(matchDate)}</span>` : '';
                    const editBtn = hasPerm('matches.edit') ? `<button class="btn btn-secondary btn-sm admin-edit-match" data-id="${m.id}" title="Editar partida">✏️</button>` : '';
                    const scoreBtn = hasPerm('matches.score') ? `<button class="btn btn-secondary btn-sm admin-edit-score" data-id="${m.id}" title="Editar placar">⚽</button>` : '';
                    const deleteBtn = hasPerm('matches.delete') ? `<button class="btn btn-danger btn-sm admin-delete-match" data-id="${m.id}">🗑️</button>` : '';
                    matchesHtml += `<div class="admin-list-item">
                        <span class="admin-item-label">${m.mandante} <em>${score}</em> ${m.visitante} ${dateStr}</span>
                        ${editBtn}${scoreBtn}${deleteBtn}
                    </div>`;
                });
        });
        $('#admin-matches-list').innerHTML = matchesHtml || '<p class="hint">Nenhuma partida cadastrada.</p>';
        $$('.admin-delete-match').forEach(btn => btn.addEventListener('click', () => deleteMatch(btn.dataset.id)));
        $$('.admin-edit-score').forEach(btn => btn.addEventListener('click', () => openEditScoreModal(btn.dataset.id)));
        $$('.admin-edit-match').forEach(btn => btn.addEventListener('click', () => openEditMatchModal(btn.dataset.id)));
    }

    // Render users management
    if (hasPerm('users.manage')) renderUsersPanel();
    // Render roles management
    if (hasPerm('roles.manage')) renderRolesPanel();
}

// ─── Users Panel ──────────────────────────────────────────────────────────────
function renderUsersPanel() {
    const list = $('#admin-users-list');
    if (!list) return;
    const roleOptions = state.roles.map(r => `<option value="${r.id}">${r.nome}</option>`).join('');
    // Populate the "add user" role dropdown
    const newUserRole = $('#admin-new-user-role');
    if (newUserRole) newUserRole.innerHTML = roleOptions;
    let html = '';
    state.usuarios.forEach(u => {
        const roleDoc = state.roles.find(r => r.id === u.role);
        const roleName = roleDoc ? roleDoc.nome : u.role || 'Sem role';
        html += `<div class="admin-list-item">
            <span class="admin-item-label">${u.email} <small class="badge badge-sm">${roleName}</small></span>
            <select class="admin-user-role-select styled-select" data-uid="${u.id}" data-email="${u.email}">
                ${state.roles.map(r => `<option value="${r.id}" ${r.id === u.role ? 'selected' : ''}>${r.nome}</option>`).join('')}
            </select>
            <button class="btn btn-secondary btn-sm admin-reset-pw-user" data-uid="${u.id}" data-email="${u.email}" title="Redefinir senha">🔑</button>
            <button class="btn btn-danger btn-sm admin-delete-user" data-uid="${u.id}" data-email="${u.email}">🗑️</button>
        </div>`;
    });
    list.innerHTML = html || '<p class="hint">Nenhum usuário cadastrado.</p>';

    $$('.admin-reset-pw-user').forEach(btn => {
        btn.addEventListener('click', async () => {
            const email = btn.dataset.email;
            const uid = btn.dataset.uid;
            const usuario = state.usuarios.find(u => u.id === uid);
            const storedPw = usuario?.senha;
            if (!storedPw) {
                showToast('Senha atual não armazenada. Delete e recrie o usuário.', 'error');
                return;
            }
            const newPw = prompt(`Nova senha para ${email} (mín. 6 caracteres):`);
            if (!newPw) return;
            if (newPw.length < 6) { showToast('A senha precisa ter pelo menos 6 caracteres.', 'error'); return; }
            try {
                const { initializeApp: initApp, deleteApp } = await import('https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js');
                const { getAuth: getAuth2, signInWithEmailAndPassword: signIn2, updatePassword: updatePw } = await import('https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js');
                const tempApp = initApp(firebaseConfig, 'temp-reset-pw');
                const tempAuth = getAuth2(tempApp);
                const cred = await signIn2(tempAuth, email, storedPw);
                await updatePw(cred.user, newPw);
                await deleteApp(tempApp);
                await updateDoc(doc(db, 'usuarios', uid), { senha: newPw });
                usuario.senha = newPw;
                showToast(`Senha de ${email} redefinida com sucesso!`);
            } catch (e) {
                showToast('Erro ao redefinir senha: ' + e.message, 'error');
            }
        });
    });

    $$('.admin-user-role-select').forEach(sel => {
        sel.addEventListener('change', async () => {
            try {
                await updateDoc(doc(db, 'usuarios', sel.dataset.uid), { role: sel.value });
                const u = state.usuarios.find(x => x.id === sel.dataset.uid);
                if (u) u.role = sel.value;
                showToast(`Role de ${sel.dataset.email} atualizada!`);
                // If the user changed their own role, reload permissions
                if (sel.dataset.email === state.userEmail) await setAdminMode(auth.currentUser);
                else renderUsersPanel();
            } catch (e) { showToast('Erro: ' + e.message, 'error'); }
        });
    });

    $$('.admin-delete-user').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.dataset.email === state.userEmail) {
                showToast('Você não pode remover a si mesmo.', 'error');
                return;
            }
            if (!confirm(`Remover acesso de ${btn.dataset.email}?`)) return;
            try {
                await deleteDoc(doc(db, 'usuarios', btn.dataset.uid));
                state.usuarios = state.usuarios.filter(u => u.id !== btn.dataset.uid);
                showToast('Usuário removido.');
                renderUsersPanel();
            } catch (e) { showToast('Erro: ' + e.message, 'error'); }
        });
    });
}

async function addUserFromPanel() {
    const emailInput = $('#admin-new-user-email');
    const passwordInput = $('#admin-new-user-password');
    const roleSelect = $('#admin-new-user-role');
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const role = roleSelect.value;
    if (!email || !password || !role) { showToast('Preencha email, senha e role.', 'error'); return; }
    if (password.length < 6) { showToast('A senha precisa ter pelo menos 6 caracteres.', 'error'); return; }
    if (state.usuarios.find(u => u.email === email)) { showToast('Usuário já cadastrado.', 'error'); return; }
    try {
        // Create Firebase Auth user via secondary app to avoid signing out current admin
        const { initializeApp: initApp, deleteApp } = await import('https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js');
        const { getAuth: getAuth2, createUserWithEmailAndPassword: createUser } = await import('https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js');
        const tempApp = initApp(firebaseConfig, 'temp-create-user');
        const tempAuth = getAuth2(tempApp);
        await createUser(tempAuth, email, password);
        await deleteApp(tempApp);

        // Save to Firestore usuarios collection
        const ref = await addDoc(collection(db, 'usuarios'), { email, role, senha: password });
        state.usuarios.push({ id: ref.id, email, role, senha: password });
        emailInput.value = '';
        passwordInput.value = '';
        showToast(`Usuário ${email} criado com sucesso!`);
        renderUsersPanel();
    } catch (e) {
        const msg = e.code === 'auth/email-already-in-use' ? 'Este email já possui conta no Firebase Auth.'
            : e.code === 'auth/invalid-email' ? 'Email inválido.'
            : e.code === 'auth/weak-password' ? 'Senha muito fraca (mínimo 6 caracteres).'
            : e.message;
        showToast('Erro: ' + msg, 'error');
    }
}

// ─── Roles Panel ──────────────────────────────────────────────────────────────
function renderRolesPanel() {
    const list = $('#admin-roles-list');
    if (!list) return;
    let html = '';
    state.roles.forEach(r => {
        const permCount = (r.permissoes || []).length;
        html += `<div class="admin-list-item">
            <span class="admin-item-label">${r.nome} <small class="badge badge-sm">${r.id}</small> <small>${permCount} permissões</small></span>
            <button class="btn btn-secondary btn-sm admin-edit-role" data-id="${r.id}" title="Editar permissões">✏️</button>
            <button class="btn btn-danger btn-sm admin-delete-role" data-id="${r.id}">🗑️</button>
        </div>`;
    });
    list.innerHTML = html || '<p class="hint">Nenhuma role cadastrada.</p>';

    $$('.admin-edit-role').forEach(btn => btn.addEventListener('click', () => openEditRoleModal(btn.dataset.id)));
    $$('.admin-delete-role').forEach(btn => {
        btn.addEventListener('click', async () => {
            const roleId = btn.dataset.id;
            const usersWithRole = state.usuarios.filter(u => u.role === roleId);
            if (usersWithRole.length > 0) {
                showToast(`Não é possível excluir: ${usersWithRole.length} usuário(s) usam esta role.`, 'error');
                return;
            }
            if (!confirm(`Excluir role "${roleId}"?`)) return;
            try {
                await deleteDoc(doc(db, 'roles', roleId));
                state.roles = state.roles.filter(r => r.id !== roleId);
                showToast('Role excluída.');
                renderRolesPanel();
            } catch (e) { showToast('Erro: ' + e.message, 'error'); }
        });
    });
}

async function addRoleFromPanel() {
    const idInput = $('#admin-new-role-id');
    const nameInput = $('#admin-new-role-name');
    const roleId = idInput.value.trim().toLowerCase().replace(/\s+/g, '_');
    const roleName = nameInput.value.trim();
    if (!roleId || !roleName) { showToast('Preencha ID e nome.', 'error'); return; }
    if (state.roles.find(r => r.id === roleId)) { showToast('Role já existe.', 'error'); return; }
    try {
        await setDoc(doc(db, 'roles', roleId), { nome: roleName, permissoes: [] });
        state.roles.push({ id: roleId, nome: roleName, permissoes: [] });
        idInput.value = '';
        nameInput.value = '';
        showToast(`Role "${roleName}" criada! Edite as permissões.`);
        renderRolesPanel();
        renderUsersPanel();
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

function openEditRoleModal(roleId) {
    const role = state.roles.find(r => r.id === roleId);
    if (!role) return;
    $('#edit-role-name').textContent = `${role.nome} (${role.id})`;
    const permsContainer = $('#edit-role-perms');
    permsContainer.innerHTML = ALL_PERMISSIONS.map(p => {
        const checked = (role.permissoes || []).includes(p.key) ? 'checked' : '';
        return `<label class="perm-checkbox"><input type="checkbox" value="${p.key}" ${checked}> ${p.label}</label>`;
    }).join('');
    $('#edit-role-modal').dataset.roleId = roleId;
    $('#edit-role-modal').classList.remove('hidden');
}

function closeEditRoleModal() {
    $('#edit-role-modal').classList.add('hidden');
}

async function saveEditRole() {
    const roleId = $('#edit-role-modal').dataset.roleId;
    const perms = Array.from($$('#edit-role-perms input:checked')).map(cb => cb.value);
    try {
        await updateDoc(doc(db, 'roles', roleId), { permissoes: perms });
        const r = state.roles.find(x => x.id === roleId);
        if (r) r.permissoes = perms;
        closeEditRoleModal();
        showToast('Permissões atualizadas!');
        // Reload own permissions if changed
        if (state.userRole === roleId) await setAdminMode(auth.currentUser);
        else renderRolesPanel();
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
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
    $('#edit-match-modal-date').value = getMatchDateForMatch(m) || '';
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
    const m = state.matches.find(x => x.id === id);
    const oldOrdem = m ? (m.ordem ?? 0) : 0;
    const oldRodada = m ? m.rodada : rodada;
    const dateVal = $('#edit-match-modal-date').value || null;
    try {
        await updateDoc(doc(db, 'jogos', id), { rodada, mandante, visitante });
        // If rodada changed, delete old date entry
        const oldDateKey = `R${oldRodada}_O${oldOrdem}`;
        const newDateKey = `R${rodada}_O${oldOrdem}`;
        if (oldDateKey !== newDateKey) {
            await deleteDoc(doc(db, 'datas_jogos', oldDateKey)).catch(() => {});
        }
        await setDoc(doc(db, 'datas_jogos', newDateKey), { rodada, ordem: oldOrdem, data_hora: dateVal }, { merge: true });
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
    $('#edit-match-date').value = getMatchDateForMatch(m) || '';
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
    const dateVal = $('#edit-match-date').value || null;
    const ordem = m.ordem ?? 0;
    try {
        await updateDoc(doc(db, 'jogos', m.id), {
            gols_mandante: hg !== '' ? parseInt(hg) : null,
            gols_visitante: ag !== '' ? parseInt(ag) : null,
            tiebreak: tb,
        });
        // Save date to separate collection
        const dateKey = `R${m.rodada}_O${ordem}`;
        await setDoc(doc(db, 'datas_jogos', dateKey), { rodada: m.rodada, ordem, data_hora: dateVal }, { merge: true });
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
        // Auto-reseed quartas when a play-in match is saved with a result
        if (m.fase === 'playin') {
            await reseedQuartasFromPlayIn();
        }
        // Auto-advance winners to next phase
        if (m.fase === 'quartas' || m.fase === 'semis') {
            await advanceWinners(m.fase);
        }
    } catch (e) {
        showError('Erro ao salvar partida: ' + e.message);
    }
}

// ─── Export / Import ──────────────────────────────────────────────────────────
function exportData() {
    const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        config: state.config,
        teams: state.teams,
        matches: state.matches,
        knockout: state.knockout,
        matchDates: state.matchDates,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `campeonato-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup exportado com sucesso!', 'success');
}

async function importData(file) {
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.version || !data.teams || !data.matches) {
            showToast('Arquivo inválido ou formato não reconhecido.', 'error');
            return;
        }

        const confirmed = confirm(
            `Isso vai SUBSTITUIR todos os dados atuais pelo backup de ${data.exportedAt ? new Date(data.exportedAt).toLocaleString('pt-BR') : 'data desconhecida'}.\n\nDeseja continuar?`
        );
        if (!confirmed) return;

        showToast('Importando dados...', 'info', 60000);

        const batch = writeBatch(db);

        // Config
        if (data.config) {
            batch.set(doc(db, 'config', 'main'), data.config);
        }

        // Delete existing teams/matches/knockout/dates then re-add
        const [teamsSnap, matchesSnap, koSnap, datesSnap] = await Promise.all([
            getDocs(collection(db, 'times')),
            getDocs(collection(db, 'jogos')),
            getDocs(collection(db, 'mata_mata')),
            getDocs(collection(db, 'datas_jogos')),
        ]);

        teamsSnap.docs.forEach(d => batch.delete(d.ref));
        matchesSnap.docs.forEach(d => batch.delete(d.ref));
        koSnap.docs.forEach(d => batch.delete(d.ref));
        datesSnap.docs.forEach(d => batch.delete(d.ref));

        await batch.commit();

        // Write new data in a new batch
        const batch2 = writeBatch(db);
        (data.teams || []).forEach(t => {
            const { id, ...rest } = t;
            batch2.set(doc(db, 'times', id || crypto.randomUUID()), rest);
        });
        (data.matches || []).forEach(m => {
            const { id, ...rest } = m;
            batch2.set(doc(db, 'jogos', id || crypto.randomUUID()), rest);
        });
        (data.knockout || []).forEach(m => {
            const { id, ...rest } = m;
            batch2.set(doc(db, 'mata_mata', id || crypto.randomUUID()), rest);
        });
        (data.matchDates || []).forEach(d => {
            const { id, ...rest } = d;
            batch2.set(doc(db, 'datas_jogos', id || `R${rest.rodada}_O${rest.ordem}`), rest);
        });
        // Migrate v1 backups: extract data_hora from matches into datas_jogos
        if (!data.matchDates && data.matches) {
            data.matches.forEach(m => {
                if (m.data_hora) {
                    const key = `R${m.rodada}_O${m.ordem ?? 0}`;
                    batch2.set(doc(db, 'datas_jogos', key), { rodada: m.rodada, ordem: m.ordem ?? 0, data_hora: m.data_hora });
                }
            });
        }

        await batch2.commit();
        showToast('Backup importado com sucesso!', 'success');
    } catch (e) {
        showToast('Erro ao importar: ' + e.message, 'error');
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

async function setAdminMode(user) {
    if (!user) {
        state.isAdmin = false;
        state.userEmail = null;
        state.userRole = null;
        state.userPermissions = [];
        $('#admin-login-btn').classList.toggle('hidden', false);
        $('#admin-logout-btn').classList.toggle('hidden', true);
        $('#admin-tab-btn').classList.toggle('hidden', true);
        if ($('.nav-tab.active')?.dataset.tab === 'admin') showTab('classificacao');
        if (Object.values(state.dataReady).every(Boolean)) {
            const hasData = state.teams.length > 0 || state.matches.length > 0 || state.config.nome_campeonato;
            if (hasData) { $('#setup-message').classList.add('hidden'); renderAll(); }
            else { $('#setup-message').classList.remove('hidden'); }
        }
        return;
    }

    state.userEmail = user.email;
    await loadRolesAndUsers();

    // Find user's role
    const userDoc = state.usuarios.find(u => u.email === user.email);
    const roleName = userDoc ? userDoc.role : null;
    state.userRole = roleName;

    if (roleName) {
        const roleDoc = state.roles.find(r => r.id === roleName);
        state.userPermissions = roleDoc ? (roleDoc.permissoes || []) : [];
    } else {
        state.userPermissions = [];
    }

    state.isAdmin = state.userPermissions.length > 0;

    $('#admin-login-btn').classList.toggle('hidden', state.isAdmin);
    $('#admin-logout-btn').classList.toggle('hidden', !state.isAdmin);
    $('#admin-tab-btn').classList.toggle('hidden', !state.isAdmin);

    if (!state.isAdmin && $('.nav-tab.active')?.dataset.tab === 'admin') {
        showTab('classificacao');
    }
    if (Object.values(state.dataReady).every(Boolean)) {
        const hasData = state.teams.length > 0 || state.matches.length > 0 || state.config.nome_campeonato;
        if (state.isAdmin || hasData) {
            $('#setup-message').classList.add('hidden');
            renderAll();
        } else {
            $('#setup-message').classList.remove('hidden');
        }
    }
}

async function loadRolesAndUsers() {
    try {
        const [rolesSnap, usersSnap] = await Promise.all([
            getDocs(collection(db, 'roles')),
            getDocs(collection(db, 'usuarios')),
        ]);
        state.roles = rolesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.usuarios = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Seed defaults if empty
        if (state.roles.length === 0) {
            const allPerms = ALL_PERMISSIONS.map(p => p.key);
            await setDoc(doc(db, 'roles', 'admin'), { nome: 'Administrador', permissoes: allPerms });
            await setDoc(doc(db, 'roles', 'arbitro'), { nome: 'Árbitro', permissoes: ['matches.score', 'bracket.score'] });
            state.roles = [
                { id: 'admin', nome: 'Administrador', permissoes: allPerms },
                { id: 'arbitro', nome: 'Árbitro', permissoes: ['matches.score', 'bracket.score'] },
            ];
        }
        if (state.usuarios.length === 0) {
            const defaults = [
                { email: 'felipe.negri43@gmail.com', role: 'admin' },
                { email: 'gugabots@gmail.com', role: 'admin' },
                { email: 'arbitrobrasileiraoftv@gmail.com', role: 'arbitro' },
            ];
            for (const u of defaults) {
                const ref = doc(collection(db, 'usuarios'));
                await setDoc(ref, u);
            }
            state.usuarios = defaults;
        }
    } catch (e) {
        console.error('Error loading roles/users:', e);
    }
}

// ─── Firestore CRUD ───────────────────────────────────────────────────────────
async function saveConfig() {
    const name = $('#admin-champ-name').value.trim();
    const hideName = $('#admin-hide-name').checked;
    try {
        await setDoc(doc(db, 'config', 'main'), { nome_campeonato: name, ocultar_nome: hideName }, { merge: true });
        showToast('Configurações salvas!');
    } catch (e) {
        showError('Erro ao salvar configurações: ' + e.message);
    }
}

async function saveRules() {
    const regras = $('#admin-rules').value;
    try {
        await setDoc(doc(db, 'config', 'main'), { regras }, { merge: true });
        showToast('Regras salvas!');
    } catch (e) {
        showError('Erro ao salvar regras: ' + e.message);
    }
}

async function saveAbout() {
    const sobre = $('#admin-about').value;
    try {
        await setDoc(doc(db, 'config', 'main'), { sobre }, { merge: true });
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
    const dateVal = $('#admin-match-date').value || null;
    try {
        await addDoc(collection(db, 'jogos'), {
            rodada, mandante, visitante,
            gols_mandante: null, gols_visitante: null, ordem,
        });
        // Save date to separate collection
        if (dateVal) {
            const dateKey = `R${rodada}_O${ordem}`;
            await setDoc(doc(db, 'datas_jogos', dateKey), { rodada, ordem, data_hora: dateVal });
        }
        $('#admin-match-round').value = '';
        $('#admin-match-date').value = '';
        showToast('Partida adicionada!');
    } catch (e) {
        showError('Erro ao adicionar partida: ' + e.message);
    }
}

async function deleteMatch(id) {
    if (!confirm('Excluir esta partida?')) return;
    const m = state.matches.find(x => x.id === id);
    try {
        await deleteDoc(doc(db, 'jogos', id));
        // Also delete the date entry
        if (m) {
            const dateKey = `R${m.rodada}_O${m.ordem ?? 0}`;
            await deleteDoc(doc(db, 'datas_jogos', dateKey)).catch(() => {});
        }
        showToast('Partida excluída.', 'info');
    } catch (e) {
        showError('Erro ao excluir partida: ' + e.message);
    }
}

async function initBracket() {
    if (state.knockout.length > 0 && !confirm('Já existe um bracket. Deseja recriar?')) return;
    const structure = [
        // Play-In: 5°×12°, 6°×11°, 7°×10°, 8°×9°
        ...Array(4).fill(null).map((_, i) => ({ fase: 'playin', ordem: i, time1: '', time2: '', gols1: null, gols2: null, pen1: null, pen2: null })),
        // Quartas: 1°–4° (direto) vs vencedores do play-in (reordenados)
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

async function fillBracketFromStandings() {
    if (state.knockout.length === 0) {
        showToast('Inicialize o bracket primeiro.', 'error');
        return;
    }
    if (state.standings.length < 12) {
        showToast('É necessário ter pelo menos 12 times na classificação.', 'error');
        return;
    }
    if (!confirm('Preencher o Play In e as Quartas com os times da classificação atual?\n\nIsso substituirá os times já inseridos nessas fases (placar não será alterado).')) return;

    const s = state.standings;
    // Play-In: 5°×12°, 6°×11°, 7°×10°, 8°×9°
    const playinPairs = [
        [s[4].name, s[11].name],  // 5° vs 12°
        [s[5].name, s[10].name],  // 6° vs 11°
        [s[6].name, s[9].name],   // 7° vs 10°
        [s[7].name, s[8].name],   // 8° vs 9°
    ];

    // Quartas: top 4 direto (initially paired with TBD from play-in winners)
    // 1° vs pior play-in winner, 2° vs 2ª pior, 3° vs 3ª pior, 4° vs melhor play-in winner
    const quartasHome = [s[0].name, s[1].name, s[2].name, s[3].name];

    try {
        const batch = writeBatch(db);

        // Fill play-in matches
        const playinMatches = state.knockout
            .filter(m => m.fase === 'playin')
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        playinMatches.forEach((m, i) => {
            if (i < playinPairs.length) {
                batch.update(doc(db, 'mata_mata', m.id), {
                    time1: playinPairs[i][0],
                    time2: playinPairs[i][1],
                });
            }
        });

        // Fill quartas with the top 4 teams (opponent TBD until play-in completes)
        const quartasMatches = state.knockout
            .filter(m => m.fase === 'quartas')
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        quartasMatches.forEach((m, i) => {
            if (i < quartasHome.length) {
                batch.update(doc(db, 'mata_mata', m.id), {
                    time1: quartasHome[i],
                    time2: '', // TBD - filled after play-in
                });
            }
        });

        await batch.commit();
        showToast('Bracket preenchido! Play In com times 5°–12°, Quartas com 1°–4°.', 'success', 5000);
        showTab('mata-mata');
    } catch (e) {
        showError('Erro ao preencher bracket: ' + e.message);
    }
}

// After all play-in results are in, reseed quartas opponents per regulation
async function reseedQuartasFromPlayIn() {
    const playinMatches = state.knockout
        .filter(m => m.fase === 'playin')
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    const winners = playinMatches.map(getMatchWinner);
    if (winners.some(w => !w)) return; // not all play-in decided yet

    // Get original standings positions for the winners
    const positionOf = (name) => state.standings.findIndex(t => t.name === name);
    // Sort winners by original position descending (worst first)
    const sorted = [...winners]
        .map(name => ({ name, pos: positionOf(name) }))
        .sort((a, b) => b.pos - a.pos); // worst (highest index) first

    // Quartas assignment: 1° vs worst winner, 2° vs 2nd worst, 3° vs 3rd worst, 4° vs best winner
    const quartasMatches = state.knockout
        .filter(m => m.fase === 'quartas')
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    if (quartasMatches.length < 4 || sorted.length < 4) return;

    try {
        const batch = writeBatch(db);
        quartasMatches.forEach((m, i) => {
            if (i < sorted.length) {
                batch.update(doc(db, 'mata_mata', m.id), {
                    time2: sorted[i].name,
                });
            }
        });
        await batch.commit();
        showToast('Quartas reordenadas automaticamente com base no Play In!', 'success', 5000);
    } catch (e) {
        console.error('Erro ao reordenar quartas:', e);
    }
}

function getMatchWinner(m) {
    if (m.gols1 == null || m.gols2 == null) return null;
    if (m.gols1 > m.gols2) return m.time1;
    if (m.gols2 > m.gols1) return m.time2;
    if (m.pen1 != null && m.pen2 != null) {
        if (m.pen1 > m.pen2) return m.time1;
        if (m.pen2 > m.pen1) return m.time2;
    }
    return null;
}

// Advance winners: quartas→semis, semis→final
// Semis: semi0 = winner(quartas0) vs winner(quartas1), semi1 = winner(quartas2) vs winner(quartas3)
// Final: winner(semi0) vs winner(semi1)
async function advanceWinners(fromPhase) {
    const nextPhase = fromPhase === 'quartas' ? 'semis' : 'final';
    const sourceMatches = state.knockout
        .filter(m => m.fase === fromPhase)
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const destMatches = state.knockout
        .filter(m => m.fase === nextPhase)
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    if (destMatches.length === 0) return;

    // Mapping: which source matches feed into which dest slot
    // quartas→semis: [0,1]→semi0, [2,3]→semi1
    // semis→final:   [0,1]→final0
    const mappings = fromPhase === 'quartas'
        ? [[0, 1], [2, 3]]  // semi0 gets winners of quartas 0,1; semi1 gets winners of quartas 2,3
        : [[0, 1]];          // final gets winners of semi 0,1

    try {
        const batch = writeBatch(db);
        let updated = false;
        mappings.forEach((srcIndices, destIdx) => {
            if (destIdx >= destMatches.length) return;
            const winners = srcIndices.map(i => i < sourceMatches.length ? getMatchWinner(sourceMatches[i]) : null);
            const dest = destMatches[destIdx];
            const newTime1 = winners[0] || '';
            const newTime2 = winners[1] || '';
            if (dest.time1 !== newTime1 || dest.time2 !== newTime2) {
                batch.update(doc(db, 'mata_mata', dest.id), { time1: newTime1, time2: newTime2 });
                updated = true;
            }
        });
        if (updated) await batch.commit();
    } catch (e) {
        console.error('Erro ao avançar vencedores:', e);
    }
}

async function generateRoundRobin() {
    const teams = [...state.teams];
    if (teams.length < 2) { showToast('Cadastre pelo menos 2 times antes de gerar as rodadas.', 'error'); return; }
    // Shuffle teams so each generation produces different fixtures
    for (let i = teams.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [teams[i], teams[j]] = [teams[j], teams[i]];
    }
    if (state.matches.length > 0 && !confirm(`Já existem ${state.matches.length} partidas cadastradas. Deseja apagar tudo e gerar novamente?\n\n(As datas já preenchidas serão preservadas)`)) return;

    // Migrate existing dates to datas_jogos before deleting matches
    const dateBatch = writeBatch(db);
    let datesMigrated = 0;
    state.matches.forEach(m => {
        const matchDate = getMatchDateForMatch(m);
        if (matchDate) {
            const key = `R${m.rodada}_O${m.ordem ?? 0}`;
            dateBatch.set(doc(db, 'datas_jogos', key), { rodada: m.rodada, ordem: m.ordem ?? 0, data_hora: matchDate });
            datesMigrated++;
        }
    });
    if (datesMigrated > 0) await dateBatch.commit();

    // Circle algorithm: if odd number of teams, add a "bye" placeholder
    const list = teams.length % 2 === 0 ? [...teams] : [...teams, null];
    const n = list.length;
    const numRounds = n - 1;
    const matchesPerRound = n / 2;

    const fixtures = [];
    const rotation = list.slice(1);

    for (let round = 0; round < numRounds; round++) {
        const roundTeams = [list[0], ...rotation];
        for (let i = 0; i < matchesPerRound; i++) {
            const home = roundTeams[i];
            const away = roundTeams[n - 1 - i];
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
        rotation.unshift(rotation.pop());
    }

    try {
        const batch = writeBatch(db);
        state.matches.forEach(m => batch.delete(doc(db, 'jogos', m.id)));
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
        showToast(`${fixtures.length} partidas geradas em ${numRounds} rodadas!${datesMigrated > 0 ? ` (${datesMigrated} datas preservadas)` : ''}`, 'success', 5000);
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

    onSnapshot(collection(db, 'datas_jogos'), snap => {
        state.matchDates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.dataReady.matchDates = true;
        afterUpdate();
    }, err => { console.error(err); state.dataReady.matchDates = true; onDataUpdate(); });

    onSnapshot(collection(db, 'mata_mata'), snap => {
        const order = { playin: 0, quartas: 1, semis: 2, final: 3 };
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
    $('#admin-fill-bracket').addEventListener('click', fillBracketFromStandings);
    $('#admin-generate-rounds').addEventListener('click', generateRoundRobin);
    $('#admin-export-btn').addEventListener('click', exportData);
    $('#admin-import-file').addEventListener('change', e => {
        const file = e.target.files[0];
        importData(file);
        e.target.value = ''; // reset so same file can be re-selected
    });

    // Users/Roles management
    $('#admin-add-user-btn').addEventListener('click', addUserFromPanel);
    $('#admin-add-role-btn').addEventListener('click', addRoleFromPanel);
    $('#edit-role-save').addEventListener('click', saveEditRole);
    $('#edit-role-cancel').addEventListener('click', closeEditRoleModal);
    $('#edit-role-modal').querySelector('.modal-overlay').addEventListener('click', closeEditRoleModal);

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
            closeEditPlayersModal(); closeEditRoleModal();
            $('#team-card-modal').classList.add('hidden');
            $('#team-popover').classList.add('hidden');
        }
    });

    onAuthStateChanged(auth, user => setAdminMode(user));

    showLoading(true);
    setupListeners();

    // Expose for E2E testing
    window.__app = { state, openEditBracketModal };
}

init();
