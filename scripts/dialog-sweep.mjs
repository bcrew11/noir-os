// Opens every dialog in browser mode and checks the focused item (and its glow) is never clipped.
// Usage: node scripts/dialog-sweep.mjs   (needs `npm run dev`)
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const results = [];
// Walk to the bottom and to the right-most items of a dialog; at every step check that the focused
// element (plus ~10px for its glow/scale) is inside the dialog's visible scroll area.
async function sweep(name) {
  await page.waitForTimeout(700);
  const problems = new Set();
  for (const key of [...Array(14).fill('ArrowDown'), ...Array(10).fill('ArrowRight'), ...Array(14).fill('ArrowUp')]) {
    await page.keyboard.press(key); await page.waitForTimeout(90);
    const p = await page.evaluate(() => {
      const f = document.querySelector('[role=dialog] [data-focused]');
      if (!f) return 'no focus inside dialog';
      const area = f.closest('.overflow-y-auto') ?? f.closest('[role=dialog]');
      const a = area.getBoundingClientRect(), r = f.getBoundingClientRect(), m = 6;
      const out = [];
      if (r.left - m < a.left) out.push('left'); if (r.right + m > a.right) out.push('right');
      if (r.top - m < a.top) out.push('top'); if (r.bottom + m > a.bottom) out.push('bottom');
      const d = document.querySelector('[role=dialog]').getBoundingClientRect();
      if (d.bottom > innerHeight || d.top < 0) out.push('dialog off-screen');
      return out.length ? `${(f.textContent || f.getAttribute('aria-label') || '').trim().slice(0, 18)}: ${out.join('/')}` : null;
    });
    if (p) problems.add(p);
  }
  results.push(`${name}: ${problems.size ? [...problems].join('; ') : 'OK'}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
}
const go = async (label) => { await page.click(`nav >> text=${label}`); await page.mouse.move(5, 5); await page.waitForTimeout(700); };
await page.goto('http://localhost:5173'); await page.waitForSelector('[data-app]'); await page.waitForTimeout(900);
// App options (hold OK)
await page.keyboard.down('Enter'); await page.waitForTimeout(800); await page.keyboard.up('Enter'); await sweep('App options (Home)');
// Apps: search + options from library
await go('Apps'); await page.getByRole('button', { name: /Search/ }).click(); await page.mouse.move(5, 5); await sweep('App search keyboard');
await page.locator('[data-app="hulu"]').click(); await page.mouse.move(5, 5); await sweep('App options (Library)');
// Inputs: rename dialog (hold OK on an input)
await go('Inputs'); await page.keyboard.down('Enter'); await page.waitForTimeout(800); await page.keyboard.up('Enter'); await sweep('Input customize');
// Settings pickers and dialogs
await go('Settings');
const open = async (section, row) => { await page.locator('aside button', { hasText: section }).click(); await page.waitForTimeout(300); await page.getByText(row, { exact: true }).first().click(); await page.mouse.move(5, 5); };
await open('Appearance', 'Accent color'); await sweep('Picker: accent (grid)');
await open('Appearance', 'Background'); await sweep('Picker: background (grid)');
await open('Appearance', 'Animation'); await sweep('Picker: animation (list)');
await open('Appearance', 'Edge margin'); await sweep('Picker: edge margin (list)');
await open('Ambient', 'Theme'); await sweep('Picker: ambient theme (grid)');
await open('Ambient', 'Start after inactivity'); await sweep('Picker: idle (list)');
await open('Devices', 'Enter TV IP address'); await sweep('TV IP keypad');
await open('Devices', 'Connect your phone'); await sweep('Phone QR');
await open('System', 'Reset preferences'); await sweep('Reset confirm');
console.log(results.join('\n'));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await b.close();
