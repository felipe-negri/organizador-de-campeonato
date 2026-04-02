import { test } from '@playwright/test';

const EMAIL = 'teste@teste.com.br';
const PASSWORD = 'teste123';
const delay = (ms) => new Promise(r => setTimeout(r, ms));

test('Bracket only: play-in → quartas → semis → final', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Login
    await page.click('#admin-login-btn');
    await page.waitForSelector('#login-modal:not(.hidden)');
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.click('#login-submit');
    await page.waitForSelector('#admin-tab-btn:not(.hidden)', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Go to mata-mata
    await page.click('.nav-tab[data-tab="mata-mata"]');
    await page.waitForTimeout(2000);

    // Helper
    async function scoreBracketMatch(matchId, g1, g2) {
        await page.evaluate((id) => window.__app.openEditBracketModal(id), matchId);
        await page.waitForSelector('#edit-bracket-modal:not(.hidden)', { timeout: 5000 });
        await page.fill('#edit-bracket-goals1', String(g1));
        await page.fill('#edit-bracket-goals2', String(g2));
        await page.click('#edit-bracket-save');
        await page.waitForSelector('#edit-bracket-modal.hidden', { timeout: 10000 }).catch(() => {});
        await delay(1500);
    }

    const knockoutIds = await page.evaluate(() => {
        const s = window.__app.state;
        const result = {};
        for (const fase of ['playin', 'quartas', 'semis', 'final']) {
            result[fase] = s.knockout
                .filter(m => m.fase === fase)
                .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
                .map(m => m.id);
        }
        return result;
    });
    console.log('IDs:', JSON.stringify(knockoutIds));

    // Play-In
    const pi = [[3, 1], [2, 0], [1, 2], [0, 1]];
    for (let i = 0; i < knockoutIds.playin.length; i++) {
        await scoreBracketMatch(knockoutIds.playin[i], pi[i][0], pi[i][1]);
        console.log(`Play-in ${i+1} ✓`);
    }
    await page.waitForTimeout(2000);

    // Quartas
    const q = [[3, 0], [2, 1], [1, 2], [0, 3]];
    for (let i = 0; i < knockoutIds.quartas.length; i++) {
        await scoreBracketMatch(knockoutIds.quartas[i], q[i][0], q[i][1]);
        console.log(`Quartas ${i+1} ✓`);
    }
    await page.waitForTimeout(2000);

    // Semis
    const s = [[2, 1], [3, 2]];
    for (let i = 0; i < knockoutIds.semis.length; i++) {
        await scoreBracketMatch(knockoutIds.semis[i], s[i][0], s[i][1]);
        console.log(`Semi ${i+1} ✓`);
    }
    await page.waitForTimeout(2000);

    // Final
    await scoreBracketMatch(knockoutIds.final[0], 3, 2);
    console.log('Final ✓');

    await page.waitForTimeout(5000);
    console.log('✅ Bracket completo!');
});
