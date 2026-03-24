// ============================================
// Championship Dashboard - App
// ============================================

(function () {
    'use strict';

    // --- State ---
    const state = {
        sheetId: localStorage.getItem('sheetId') || '',
        config: {},
        teams: [],
        matches: [],
        knockout: [],
        standings: [],
        currentRound: 1,
        totalRounds: 0,
        theme: localStorage.getItem('theme') || 'dark',
    };

    // --- DOM Elements ---
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        settingsModal: $('#settings-modal'),
        sheetsInput: $('#sheets-url-input'),
        saveSettings: $('#save-settings'),
        cancelSettings: $('#cancel-settings'),
        settingsBtn: $('#settings-btn'),
        setupBtn: $('#setup-btn'),
        setupMessage: $('#setup-message'),
        themeToggle: $('#theme-toggle'),
        themeIcon: $('#theme-icon'),
        refreshBtn: $('#refresh-btn'),
        loading: $('#loading'),
        errorBanner: $('#error-message'),
        errorText: $('#error-text'),
        errorClose: $('#error-close'),
        championshipName: $('#championship-name'),
        standingsBody: $('#standings-body'),
        matchesPlayed: $('#matches-played-badge'),
        matchesContainer: $('#matches-container'),
        prevRound: $('#prev-round'),
        nextRound: $('#next-round'),
        roundLabel: $('#round-label'),
        bracketContainer: $('#bracket-container'),
        championBanner: $('#champion-banner'),
        championName: $('#champion-name'),
        lastUpdated: $('#last-updated'),
    };

    // --- Theme ---
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        dom.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
        localStorage.setItem('theme', theme);
        state.theme = theme;
    }

    // --- Google Sheets fetching ---
    function extractSheetId(input) {
        input = input.trim();
        const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
        if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;
        return null;
    }

    function sheetCsvUrl(sheetId, tabName) {
        return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    }

    async function fetchSheet(tabName) {
        const url = sheetCsvUrl(state.sheetId, tabName);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Erro ao buscar aba "${tabName}" (${res.status})`);
        const csv = await res.text();
        const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
        return parsed.data;
    }

    // --- Data loading ---
    async function loadAllData() {
        showLoading(true);
        hideError();
        try {
            const [configData, teamsData, matchesData, knockoutData] = await Promise.all([
                fetchSheet('Config'),
                fetchSheet('Times'),
                fetchSheet('Fase_Grupos'),
                fetchSheet('Mata_Mata'),
            ]);

            // Parse config
            state.config = {};
            configData.forEach(row => {
                const key = (row['Chave'] || '').trim();
                const val = (row['Valor'] || '').trim();
                if (key) state.config[key] = val;
            });

            // Parse teams
            state.teams = teamsData.map(row => ({
                name: (row['Nome'] || '').trim(),
                abbr: (row['Sigla'] || '').trim(),
                color: (row['Cor'] || '#888').trim(),
            })).filter(t => t.name);

            // Parse matches
            state.matches = matchesData.map(row => ({
                round: parseInt(row['Rodada']) || 0,
                home: (row['Mandante'] || '').trim(),
                away: (row['Visitante'] || '').trim(),
                homeGoals: row['Gols_Mandante'] !== undefined && row['Gols_Mandante'] !== '' ? parseInt(row['Gols_Mandante']) : null,
                awayGoals: row['Gols_Visitante'] !== undefined && row['Gols_Visitante'] !== '' ? parseInt(row['Gols_Visitante']) : null,
            })).filter(m => m.home && m.away);

            // Parse knockout
            state.knockout = knockoutData.map(row => ({
                phase: (row['Fase'] || '').trim().toLowerCase(),
                team1: (row['Time1'] || '').trim(),
                team2: (row['Time2'] || '').trim(),
                goals1: row['Gols1'] !== undefined && row['Gols1'] !== '' ? parseInt(row['Gols1']) : null,
                goals2: row['Gols2'] !== undefined && row['Gols2'] !== '' ? parseInt(row['Gols2']) : null,
                pen1: row['Penaltis1'] !== undefined && row['Penaltis1'] !== '' ? parseInt(row['Penaltis1']) : null,
                pen2: row['Penaltis2'] !== undefined && row['Penaltis2'] !== '' ? parseInt(row['Penaltis2']) : null,
            })).filter(m => m.phase);

            // Calculate
            state.totalRounds = Math.max(...state.matches.map(m => m.round), 0);
            if (state.currentRound < 1) state.currentRound = 1;
            if (state.currentRound > state.totalRounds) state.currentRound = state.totalRounds;

            // Find current round (last round with results or first without)
            state.currentRound = findCurrentRound();

            calculateStandings();
            renderAll();

            dom.lastUpdated.textContent = new Date().toLocaleString('pt-BR');
        } catch (err) {
            console.error(err);
            showError(err.message || 'Erro ao carregar dados');
        } finally {
            showLoading(false);
        }
    }

    function findCurrentRound() {
        for (let r = 1; r <= state.totalRounds; r++) {
            const roundMatches = state.matches.filter(m => m.round === r);
            const allPlayed = roundMatches.every(m => m.homeGoals !== null);
            if (!allPlayed) return r;
        }
        return state.totalRounds || 1;
    }

    // --- Standings calculation ---
    function calculateStandings() {
        const stats = {};
        state.teams.forEach(t => {
            stats[t.name] = {
                name: t.name,
                abbr: t.abbr,
                color: t.color,
                pts: 0, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0,
            };
        });

        state.matches.forEach(m => {
            if (m.homeGoals === null || m.awayGoals === null) return;
            const home = stats[m.home];
            const away = stats[m.away];
            if (!home || !away) return;

            home.played++;
            away.played++;
            home.gf += m.homeGoals;
            home.ga += m.awayGoals;
            away.gf += m.awayGoals;
            away.ga += m.homeGoals;

            if (m.homeGoals > m.awayGoals) {
                home.wins++; home.pts += 3;
                away.losses++;
            } else if (m.homeGoals < m.awayGoals) {
                away.wins++; away.pts += 3;
                home.losses++;
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

    // --- Render all ---
    function renderAll() {
        const name = state.config['nome_campeonato'] || 'Campeonato';
        dom.championshipName.textContent = name;
        document.title = `Dashboard - ${name}`;

        renderStandings();
        renderMatches();
        renderBracket();
    }

    // --- Render standings ---
    function renderStandings() {
        const qualify = parseInt(state.config['classificados']) || 8;
        const totalPlayed = state.matches.filter(m => m.homeGoals !== null).length;
        const totalMatches = state.matches.length;
        dom.matchesPlayed.textContent = `${totalPlayed}/${totalMatches} jogos`;

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
                    <span style="display:inline-block;width:4px;height:16px;border-radius:2px;background:${t.color};margin-right:6px;vertical-align:middle;"></span>
                    ${t.name}
                </td>
                <td class="col-stat-pts">${t.pts}</td>
                <td>${t.played}</td>
                <td>${t.wins}</td>
                <td>${t.draws}</td>
                <td>${t.losses}</td>
                <td class="col-hide-mobile">${t.gf}</td>
                <td class="col-hide-mobile">${t.ga}</td>
                <td class="col-stat-sg ${gdClass}">${gdSign}${gd}</td>
            </tr>`;
        });

        dom.standingsBody.innerHTML = html;
    }

    // --- Render matches ---
    function renderMatches() {
        updateRoundNav();
        const roundMatches = state.matches.filter(m => m.round === state.currentRound);

        if (roundMatches.length === 0) {
            dom.matchesContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">Nenhum jogo nesta rodada</p>';
            return;
        }

        const teamMap = {};
        state.teams.forEach(t => teamMap[t.name] = t);

        let html = '';
        roundMatches.forEach(m => {
            const played = m.homeGoals !== null;
            const homeTeam = teamMap[m.home] || { color: '#888' };
            const awayTeam = teamMap[m.away] || { color: '#888' };

            let homeWinner = '', awayWinner = '';
            if (played) {
                if (m.homeGoals > m.awayGoals) homeWinner = 'winner';
                else if (m.awayGoals > m.homeGoals) awayWinner = 'winner';
            }

            html += `<div class="match-card ${played ? '' : 'not-played'}">
                <div class="match-teams">
                    <div class="match-team home">
                        <span class="team-color" style="background:${homeTeam.color}"></span>
                        <span class="match-team-name ${homeWinner}">${m.home}</span>
                    </div>
                    <div class="match-score ${played ? '' : 'pending'}">
                        ${played
                    ? `<span>${m.homeGoals}</span><span class="sep">×</span><span>${m.awayGoals}</span>`
                    : `<span>vs</span>`
                }
                    </div>
                    <div class="match-team away">
                        <span class="team-color" style="background:${awayTeam.color}"></span>
                        <span class="match-team-name ${awayWinner}">${m.away}</span>
                    </div>
                </div>
            </div>`;
        });

        dom.matchesContainer.innerHTML = html;
    }

    function updateRoundNav() {
        dom.roundLabel.textContent = `Rodada ${state.currentRound}`;
        dom.prevRound.disabled = state.currentRound <= 1;
        dom.nextRound.disabled = state.currentRound >= state.totalRounds;
    }

    // --- Render bracket ---
    function renderBracket() {
        const phases = ['quartas', 'semis', 'final'];
        const phaseLabels = { quartas: 'Quartas de Final', semis: 'Semifinais', final: 'Final' };

        // Check for champion
        const finalMatch = state.knockout.find(m => m.phase === 'final');
        if (finalMatch && finalMatch.goals1 !== null && finalMatch.goals2 !== null && finalMatch.team1 && finalMatch.team2) {
            let champion = null;
            if (finalMatch.goals1 > finalMatch.goals2) champion = finalMatch.team1;
            else if (finalMatch.goals2 > finalMatch.goals1) champion = finalMatch.team2;
            else if (finalMatch.pen1 !== null && finalMatch.pen2 !== null) {
                if (finalMatch.pen1 > finalMatch.pen2) champion = finalMatch.team1;
                else if (finalMatch.pen2 > finalMatch.pen1) champion = finalMatch.team2;
            }
            if (champion) {
                dom.championBanner.classList.remove('hidden');
                dom.championName.textContent = champion;
            } else {
                dom.championBanner.classList.add('hidden');
            }
        } else {
            dom.championBanner.classList.add('hidden');
        }

        let html = '';

        phases.forEach(phase => {
            const matches = state.knockout.filter(m => m.phase === phase);
            html += `<div class="bracket-round">
                <div class="bracket-round-title">${phaseLabels[phase] || phase}</div>
                <div class="bracket-matches">`;

            if (matches.length === 0) {
                const expectedCount = phase === 'quartas' ? 4 : phase === 'semis' ? 2 : 1;
                for (let i = 0; i < expectedCount; i++) {
                    html += renderBracketMatch({ team1: '', team2: '', goals1: null, goals2: null, pen1: null, pen2: null });
                }
            } else {
                matches.forEach(m => {
                    html += renderBracketMatch(m);
                });
            }

            html += `</div></div>`;
        });

        dom.bracketContainer.innerHTML = html;
    }

    function renderBracketMatch(m) {
        const played = m.goals1 !== null && m.goals2 !== null;
        let winner = null;
        if (played && m.team1 && m.team2) {
            if (m.goals1 > m.goals2) winner = 1;
            else if (m.goals2 > m.goals1) winner = 2;
            else if (m.pen1 !== null && m.pen2 !== null) {
                if (m.pen1 > m.pen2) winner = 1;
                else if (m.pen2 > m.pen1) winner = 2;
            }
        }

        const team1Class = !m.team1 ? 'tbd' : (winner === 1 ? 'winner' : winner === 2 ? 'loser' : '');
        const team2Class = !m.team2 ? 'tbd' : (winner === 2 ? 'winner' : winner === 1 ? 'loser' : '');

        const score1Display = played ? m.goals1 + (m.pen1 !== null ? ` (${m.pen1})` : '') : '';
        const score2Display = played ? m.goals2 + (m.pen2 !== null ? ` (${m.pen2})` : '') : '';

        return `<div class="bracket-match">
            <div class="bracket-team ${team1Class}">
                <span class="bracket-team-name">${m.team1 || 'A definir'}</span>
                <span class="bracket-team-score">${score1Display}</span>
            </div>
            <div class="bracket-team ${team2Class}">
                <span class="bracket-team-name">${m.team2 || 'A definir'}</span>
                <span class="bracket-team-score">${score2Display}</span>
            </div>
        </div>`;
    }

    // --- UI helpers ---
    function showLoading(show) {
        dom.loading.classList.toggle('hidden', !show);
        $$('.tab-content').forEach(el => {
            if (show) el.classList.add('hidden');
        });
        if (!show) {
            const active = $(`.nav-tab.active`);
            if (active) showTab(active.dataset.tab);
        }
    }

    function showError(msg) {
        dom.errorBanner.classList.remove('hidden');
        dom.errorText.textContent = msg;
    }

    function hideError() {
        dom.errorBanner.classList.add('hidden');
    }

    function showTab(tabId) {
        $$('.tab-content').forEach(el => el.classList.add('hidden'));
        $$('.nav-tab').forEach(el => el.classList.remove('active'));
        const tab = $(`#tab-${tabId}`);
        const btn = $(`.nav-tab[data-tab="${tabId}"]`);
        if (tab) tab.classList.remove('hidden');
        if (btn) btn.classList.add('active');
    }

    function showSettingsModal() {
        dom.sheetsInput.value = state.sheetId ? `https://docs.google.com/spreadsheets/d/${state.sheetId}/edit` : '';
        dom.settingsModal.classList.remove('hidden');
        dom.sheetsInput.focus();
    }

    function hideSettingsModal() {
        dom.settingsModal.classList.add('hidden');
    }

    // --- Event listeners ---
    function init() {
        // Theme
        applyTheme(state.theme);
        dom.themeToggle.addEventListener('click', () => {
            applyTheme(state.theme === 'dark' ? 'light' : 'dark');
        });

        // Tabs
        $$('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => showTab(tab.dataset.tab));
        });

        // Settings
        dom.settingsBtn.addEventListener('click', showSettingsModal);
        if (dom.setupBtn) dom.setupBtn.addEventListener('click', showSettingsModal);
        dom.cancelSettings.addEventListener('click', hideSettingsModal);
        dom.settingsModal.querySelector('.modal-overlay').addEventListener('click', hideSettingsModal);

        dom.saveSettings.addEventListener('click', () => {
            const id = extractSheetId(dom.sheetsInput.value);
            if (!id) {
                alert('ID ou link inválido. Cole o link completo da planilha ou apenas o ID.');
                return;
            }
            state.sheetId = id;
            localStorage.setItem('sheetId', id);
            hideSettingsModal();
            dom.setupMessage.classList.add('hidden');
            loadAllData();
        });

        dom.sheetsInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') dom.saveSettings.click();
        });

        // Refresh
        dom.refreshBtn.addEventListener('click', () => {
            if (state.sheetId) loadAllData();
            else showSettingsModal();
        });

        // Round navigation
        dom.prevRound.addEventListener('click', () => {
            if (state.currentRound > 1) {
                state.currentRound--;
                renderMatches();
            }
        });

        dom.nextRound.addEventListener('click', () => {
            if (state.currentRound < state.totalRounds) {
                state.currentRound++;
                renderMatches();
            }
        });

        // Error close
        dom.errorClose.addEventListener('click', hideError);

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideSettingsModal();
        });

        // Initial load
        if (state.sheetId) {
            loadAllData();
        } else {
            dom.setupMessage.classList.remove('hidden');
            showLoading(false);
        }
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
