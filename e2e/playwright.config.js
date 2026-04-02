import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    timeout: 900_000,
    expect: { timeout: 15_000 },
    webServer: {
        command: 'npx serve .. -l 4567 --no-clipboard',
        port: 4567,
        reuseExistingServer: true,
        timeout: 15_000,
    },
    use: {
        baseURL: 'http://localhost:4567',
        video: 'on',
        viewport: { width: 1280, height: 800 },
        launchOptions: { slowMo: 80 },
        headless: true,
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
    ],
});
