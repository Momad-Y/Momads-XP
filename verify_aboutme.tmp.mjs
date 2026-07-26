import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.goto('http://localhost:4173/');
await page
    .getByText("To begin, click 'My' user name")
    .waitFor({ timeout: 30000 });
await page.locator('#login-user-card').click();
await page.locator('#start-menu-btn').waitFor({ timeout: 30000 });
await page.locator('#work-space p', { hasText: 'About Me' }).dblclick();
const win = page.locator('#work-space .window').first();
await win.getByText('Social Links').waitFor({ timeout: 10000 });

const report = {};

// 1. My Resume alone (no overlap)
await win.getByText('My Resume').click();
await page.waitForTimeout(1200);
report.after_my_resume = await page.locator('#work-space .window').count();
// close the pdf window (last opened, highest z)
const pdf = page.locator('#work-space .window').nth(1);
await pdf.locator('.titlebar').getByRole('button').last().click();
await page.waitForTimeout(400);

// 2. title bar of About Me: maximize / restore / minimize / restore
const tb = win.locator('.titlebar');
await tb.getByRole('button').nth(1).click();
await page.waitForTimeout(400);
const maxBox = await win.boundingBox();
report.maximize_works = maxBox != null && maxBox.width > 1200;
await tb.getByRole('button').nth(1).click();
await page.waitForTimeout(400);
const restBox = await win.boundingBox();
report.restore_works = restBox != null && Math.round(restBox.width) === 700;

// 3. My Projects (opens Explorer + transfer dialog on top)
await win.getByText('My Projects').click();
await page.waitForTimeout(800);
report.after_my_projects = await page.locator('#work-space .window').count();
const dialog = page.locator('#work-space .dialog');
report.transfer_dialog_shown = (await dialog.count()) > 0;

report.errors = errors;
console.log(JSON.stringify(report, null, 1));
await browser.close();
