import { test } from '@playwright/test';

const EMAIL = 'teste@teste.com.br';
const PASSWORD = 'teste123';
const delay = (ms) => new Promise(r => setTimeout(r, ms));

test('Bracket only: play-in → quartas → semis → 3º lugar → final', async ({ page }) => {
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

    // Semis, 3º lugar e final são melhor de 3 sets (21/21/15, 2 de vantagem)
    async function scoreSetMatch(matchId, sets) {
        await page.evaluate((id) => window.__app.openEditBracketModal(id), matchId);
        await page.waitForSelector('#edit-bracket-modal:not(.hidden)', { timeout: 5000 });
        await page.waitForSelector('#edit-bracket-sets:not(.hidden)', { timeout: 5000 });
        for (let i = 0; i < 3; i++) {
            const set = sets[i];
            await page.fill(`#edit-bracket-set${i + 1}-p1`, set ? String(set[0]) : '');
            await page.fill(`#edit-bracket-set${i + 1}-p2`, set ? String(set[1]) : '');
        }
        await page.click('#edit-bracket-save');
        await page.waitForSelector('#edit-bracket-modal.hidden', { timeout: 10000 }).catch(() => {});
        await delay(1500);
    }

    const knockoutIds = await page.evaluate(() => {
        const s = window.__app.state;
        const result = {};
        for (const fase of ['playin', 'quartas', 'semis', 'terceiro', 'final']) {
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

    // Semis — melhor de 3 sets
    const s = [
        [[21, 18], [21, 15]],            // 2×0
        [[19, 21], [22, 20], [15, 13]],  // 2×1, com set 1 vencido por 2 de vantagem acima de 21
    ];
    for (let i = 0; i < knockoutIds.semis.length; i++) {
        await scoreSetMatch(knockoutIds.semis[i], s[i]);
        console.log(`Semi ${i+1} ✓`);
    }
    await page.waitForTimeout(3000);

    // Disputa de 3º lugar — preenchida sozinha com os perdedores das semis
    const terceiroId = knockoutIds.terceiro[0]
        ?? await page.evaluate(() => window.__app.state.knockout.find(m => m.fase === 'terceiro')?.id);
    if (terceiroId) {
        await scoreSetMatch(terceiroId, [[15, 21], [21, 19], [13, 15]]); // 1×2
        console.log('3º lugar ✓');
        await page.waitForTimeout(2000);
    }

    // Final — melhor de 3 sets
    await scoreSetMatch(knockoutIds.final[0], [[21, 19], [18, 21], [16, 14]]); // 2×1
    console.log('Final ✓');

    await page.waitForTimeout(5000);
    console.log('✅ Bracket completo!');
});
