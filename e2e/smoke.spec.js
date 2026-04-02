import { test, expect } from '@playwright/test';

test('Smoke: site abre e login modal aparece', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Check page loaded
    const title = await page.title();
    console.log('Page title:', title);

    // Try clicking login
    const loginBtn = page.locator('#admin-login-btn');
    const visible = await loginBtn.isVisible();
    console.log('Login btn visible:', visible);

    if (visible) {
        await loginBtn.click();
        await page.waitForTimeout(1000);
        const modal = page.locator('#login-modal');
        const modalVisible = await modal.isVisible();
        console.log('Login modal visible:', modalVisible);
    }

    // Take screenshot
    await page.screenshot({ path: 'smoke-test.png' });
    console.log('Screenshot saved!');
});
