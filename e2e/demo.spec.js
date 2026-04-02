// @ts-check
import { test, expect } from '@playwright/test';

// ── Credenciais ─────────────────────────────────────────────────────────────
const EMAIL = 'teste@teste.com.br';
const PASSWORD = 'teste123';

// ── 16 times ────────────────────────────────────────────────────────────────
const TEAMS = [
    { name: 'Copacabana FC',    abbr: 'COP',  c1: '#FFD700' },
    { name: 'Ipanema Beach',    abbr: 'IPA',  c1: '#1E90FF' },
    { name: 'Leblon Volley',    abbr: 'LEB',  c1: '#228B22' },
    { name: 'Barra United',     abbr: 'BAR',  c1: '#FF4500' },
    { name: 'Recreio Stars',    abbr: 'REC',  c1: '#9400D3' },
    { name: 'Arpoador FC',     abbr: 'ARP',  c1: '#DC143C' },
    { name: 'Grumari Team',    abbr: 'GRU',  c1: '#FF8C00' },
    { name: 'Prainha FC',      abbr: 'PRA',  c1: '#4169E1' },
    { name: 'Joatinga Beach',  abbr: 'JOA',  c1: '#2E8B57' },
    { name: 'Flamengo Beach',  abbr: 'FLB',  c1: '#B22222' },
    { name: 'Niterói Volley',  abbr: 'NIT',  c1: '#6A5ACD' },
    { name: 'Búzios FC',       abbr: 'BUZ',  c1: '#20B2AA' },
    { name: 'Cabo Frio Team',  abbr: 'CFR',  c1: '#CD853F' },
    { name: 'Arraial Beach',   abbr: 'ARR',  c1: '#808080' },
    { name: 'Saquarema FC',    abbr: 'SAQ',  c1: '#556B2F' },
    { name: 'Maricá United',   abbr: 'MAR',  c1: '#8B4513' },
];

function randGoals(max = 4) { return Math.floor(Math.random() * (max + 1)); }
const delay = (ms) => new Promise(r => setTimeout(r, ms));

test('Demo completo: cadastro → rodadas → resultados → play-in → final', async ({ page }) => {

    // ═══════ 1. ABRIR SITE ═══════
    await page.goto('/');
    await page.waitForTimeout(2000);

    // ═══════ 2. LOGIN ═══════
    await page.click('#admin-login-btn');
    await page.waitForSelector('#login-modal:not(.hidden)');
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.click('#login-submit');
    await page.waitForSelector('#admin-tab-btn:not(.hidden)', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Go to admin
    await page.click('.nav-tab[data-tab="admin"]');
    await page.waitForTimeout(1000);

    // ═══════ 3. LIMPAR TIMES EXISTENTES ═══════
    // Delete all existing teams first to start clean
    let deleteButtons = page.locator('.admin-delete-team');
    let deleteCount = await deleteButtons.count();
    console.log(`Existing teams to delete: ${deleteCount}`);
    while (deleteCount > 0) {
        page.once('dialog', d => d.accept());
        await deleteButtons.first().click();
        await delay(500);
        deleteButtons = page.locator('.admin-delete-team');
        deleteCount = await deleteButtons.count();
    }
    await page.waitForTimeout(1000);
    console.log('All existing teams deleted');

    // ═══════ 4. CONFIGURAR CAMPEONATO ═══════
    await page.fill('#admin-champ-name', 'Brasileirão de Futvôlei 2026');
    await page.click('#admin-save-config');
    await delay(800);

    // ═══════ 5. CADASTRAR 16 TIMES ═══════
    for (const team of TEAMS) {
        await page.fill('#admin-team-name', team.name);
        await page.fill('#admin-team-abbr', team.abbr);
        await page.fill('#admin-team-color1', team.c1);
        await page.click('#admin-add-team');
        await delay(500);
    }
    console.log('16 teams registered');
    await page.waitForTimeout(1000);

    // ═══════ 6. VER CLASSIFICAÇÃO VAZIA ═══════
    await page.click('.nav-tab[data-tab="classificacao"]');
    await page.waitForTimeout(2000);

    // ═══════ 7. GERAR RODADAS ═══════
    await page.click('.nav-tab[data-tab="admin"]');
    await page.waitForTimeout(500);
    const genBtn = page.locator('#admin-generate-rounds');
    await genBtn.scrollIntoViewIfNeeded();
    page.once('dialog', d => d.accept());
    await genBtn.click();
    await delay(5000);
    console.log('Rounds generated');

    // ═══════ 8. INSERIR RESULTADOS ═══════
    // Use the edit buttons in the matches tab (public view) — they're the ✏️ editar buttons
    await page.click('.nav-tab[data-tab="admin"]');
    await page.waitForTimeout(1000);

    const matchSection = page.locator('#admin-section-matches');
    await matchSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    let editBtns = page.locator('.admin-edit-score');
    let count = await editBtns.count();
    console.log(`Total matches to score: ${count}`);

    for (let i = 0; i < count; i++) {
        editBtns = page.locator('.admin-edit-score');
        const currentCount = await editBtns.count();
        if (i >= currentCount) break;

        try {
            const btn = editBtns.nth(i);
            await btn.scrollIntoViewIfNeeded();
            await btn.click();
        } catch {
            await delay(300);
            editBtns = page.locator('.admin-edit-score');
            await editBtns.nth(i).scrollIntoViewIfNeeded();
            await editBtns.nth(i).click();
        }

        await page.waitForSelector('#edit-score-modal:not(.hidden)', { timeout: 5000 });

        await page.fill('#edit-home-goals', String(randGoals()));
        await page.fill('#edit-away-goals', String(randGoals()));
        await page.click('#edit-score-save');

        await page.waitForSelector('#edit-score-modal.hidden', { timeout: 5000 }).catch(() => {});

        if ((i + 1) % 20 === 0) console.log(`  Scored ${i + 1}/${count}`);
    }
    console.log('All matches scored!');

    // ═══════ 9. VER CLASSIFICAÇÃO FINAL ═══════
    await page.click('.nav-tab[data-tab="classificacao"]');
    await page.waitForTimeout(3000);

    // ═══════ 10. INICIALIZAR BRACKET + PREENCHER ═══════
    await page.click('.nav-tab[data-tab="admin"]');
    await page.waitForTimeout(500);
    const bracketSection = page.locator('#admin-section-bracket');
    await bracketSection.scrollIntoViewIfNeeded();

    page.once('dialog', d => d.accept());
    await page.click('#admin-init-bracket');
    await delay(2000);

    page.once('dialog', d => d.accept());
    await page.click('#admin-fill-bracket');
    await delay(2000);
    console.log('Bracket initialized and filled');

    // ═══════ 11. VER BRACKET ═══════
    await page.click('.nav-tab[data-tab="mata-mata"]');
    await page.waitForTimeout(2000);

    // ═══════ 12-15. BRACKET: PLAY-IN → QUARTAS → SEMIS → FINAL ═══════
    // Use page.evaluate to get match IDs by phase, then open modal via JS
    // (edit buttons require bracket.score permission which may not be set)

    async function scoreBracketMatch(page, matchId, g1, g2) {
        await page.evaluate((id) => window.__app.openEditBracketModal(id), matchId);
        await page.waitForSelector('#edit-bracket-modal:not(.hidden)', { timeout: 5000 });
        await page.fill('#edit-bracket-goals1', String(g1));
        await page.fill('#edit-bracket-goals2', String(g2));
        await page.click('#edit-bracket-save');
        await page.waitForSelector('#edit-bracket-modal.hidden', { timeout: 10000 }).catch(() => {});
        await delay(1500);
    }

    // Get bracket match IDs grouped by phase
    const knockoutIds = await page.evaluate(() => {
        const s = window.__app.state;
        const phases = ['playin', 'quartas', 'semis', 'final'];
        const result = {};
        for (const fase of phases) {
            result[fase] = s.knockout
                .filter(m => m.fase === fase)
                .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
                .map(m => m.id);
        }
        return result;
    });
    console.log('Bracket IDs:', JSON.stringify(knockoutIds));

    // Play-In
    const playinScores = [[3, 1], [2, 0], [1, 2], [0, 1]];
    for (let i = 0; i < knockoutIds.playin.length; i++) {
        await scoreBracketMatch(page, knockoutIds.playin[i], playinScores[i][0], playinScores[i][1]);
        console.log(`  Play-in ${i + 1}/4 ✓`);
    }
    await page.waitForTimeout(2000);

    // Quartas
    const quartasScores = [[3, 0], [2, 1], [1, 2], [0, 3]];
    for (let i = 0; i < knockoutIds.quartas.length; i++) {
        await scoreBracketMatch(page, knockoutIds.quartas[i], quartasScores[i][0], quartasScores[i][1]);
        console.log(`  Quartas ${i + 1}/4 ✓`);
    }
    await page.waitForTimeout(2000);

    // Semis
    const semisScores = [[2, 1], [3, 2]];
    for (let i = 0; i < knockoutIds.semis.length; i++) {
        await scoreBracketMatch(page, knockoutIds.semis[i], semisScores[i][0], semisScores[i][1]);
        console.log(`  Semi ${i + 1}/2 ✓`);
    }
    await page.waitForTimeout(2000);

    // Final
    await scoreBracketMatch(page, knockoutIds.final[0], 3, 2);
    console.log('  Final ✓');

    // ═══════ 16. TOUR FINAL ═══════
    await page.waitForTimeout(3000);
    await page.click('.nav-tab[data-tab="classificacao"]');
    await page.waitForTimeout(3000);
    await page.click('.nav-tab[data-tab="jogos"]');
    await page.waitForTimeout(2000);
    await page.click('.nav-tab[data-tab="mata-mata"]');
    await page.waitForTimeout(4000);

    console.log('✅ Demo completo!');
});
