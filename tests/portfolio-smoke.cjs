const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.PORTFOLIO_URL || 'http://127.0.0.1:8765';
const root = path.resolve(__dirname, '..');
let browser;

before(async () => {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });
});
after(async () => { await browser?.close(); });

async function withPage(run, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...options });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await run(page);
    assert.deepEqual(errors, [], 'No uncaught browser errors');
  } finally {
    await page.close();
  }
}

test('original homepage layout is restored with AI play navigation', async () => {
  await withPage(async page => {
    await page.goto(`${base}/index.html`);
    assert.equal(await page.locator('.nav-links a[href="ai-play.html"]').count(), 1);
    assert.equal(await page.locator('.mobile-menu a[href="ai-play.html"]').count(), 1);
    assert.equal(await page.locator('.projects-grid .project-card').count(), 3);
    assert.match(await page.locator('.hero-title').innerText(), /Designing delightful/);
    assert.equal(await page.locator('.about-v2').count(), 1);
    assert.equal(await page.locator('.msft-banner').count(), 1);
    assert.equal(await page.locator('link[href="portfolio.css"]').count(), 0);
    for (const file of ['dynamic-action-bar.html', 'user-onboarding.html']) {
      await page.goto(`${base}/${file}`);
      assert.equal(await page.locator('.case-reading-guide').count(), 0);
      assert.equal(await page.locator('.proj-hero-title').count(), 1);
      assert.equal(await page.locator('link[href="portfolio.css"]').count(), 0);
    }
  });
});

test('homepage AI play promotion precedes the first case study and opens the gallery by keyboard', async () => {
  await withPage(async page => {
    for (const [width, theme] of [[1440, 'dark'], [390, 'dark'], [1440, 'light'], [390, 'light']]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/index.html?clawpilotTheme=${theme}`);
      const promo = page.locator('.ai-promo-wrap');
      assert.equal(await promo.count(), 1);
      assert.equal(await page.locator('.projects-grid .project-card').count(), 3);
      assert.equal(await page.locator('.msft-banner-wrap').evaluate(element => element.previousElementSibling.matches('.projects-grid')), true, 'The Microsoft story immediately follows the three work projects');
      assert.equal(await promo.evaluate(element => element.previousElementSibling.matches('.section-header')), true, 'The AI play promotion is the first item after the section heading');
      assert.equal(await promo.evaluate(element => element.nextElementSibling.matches('.projects-grid')), true, 'The AI play promotion comes before the first project');
      await promo.scrollIntoViewIfNeeded();
      assert.equal(await promo.locator('.ai-promo').evaluate(element => getComputedStyle(element).borderWidth), '0px', 'The promotional surface has no outer border');
      const box = await promo.locator('.ai-promo').boundingBox();
      const wrapper = await promo.boundingBox();
      assert.equal(await promo.evaluate(element => getComputedStyle(element).borderTopStyle), 'solid', 'The horizontal divider sits above the promotional surface');
      assert.ok(box.y > wrapper.y, 'The promotion has space below the divider');
      assert.ok(box.x >= 20 && box.x + box.width <= width - 20, `Promotion fits the ${width}px viewport in ${theme}`);
      const link = promo.getByRole('link', { name: 'Explore AI play', exact: true });
      await link.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(/ai-play\.html$/);
      assert.equal(await page.locator('.experiment-card:visible').count(), 4);
    }
  });
});

test('theme persists across pages; explicit light and dark overrides work', async () => {
  await withPage(async page => {
    await page.goto(`${base}/index.html?clawpilotTheme=light`);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.locator('#themeToggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.goto(`${base}/ai-play.html`);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.goto(`${base}/ai-play.html?clawpilotTheme=light`);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.goto(`${base}/index.html?clawpilotTheme=dark`);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  });
});

test('new pages remain usable when browser storage is denied', async () => {
  await withPage(async page => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() { throw new DOMException('Storage denied', 'SecurityError'); },
      });
    });
    for (const file of ['ai-play.html', 'clicks.html']) {
      await page.goto(`${base}/${file}?clawpilotTheme=light`);
      await page.locator('#themeToggle').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    }
  });
});

test('AI play and launcher inherit the original homepage theme and typography', async () => {
  await withPage(async page => {
    for (const theme of ['light', 'dark']) {
      await page.goto(`${base}/index.html?clawpilotTheme=${theme}`);
      const original = await page.evaluate(() => {
        const style = getComputedStyle(document.body);
        return { background: style.backgroundColor, pattern: style.backgroundImage, font: style.fontFamily, text: style.color };
      });
      for (const file of ['ai-play.html', 'play.html?project=sage-interiors']) {
        const separator = file.includes('?') ? '&' : '?';
        await page.goto(`${base}/${file}${separator}clawpilotTheme=${theme}`);
        const current = await page.evaluate(() => {
          const style = getComputedStyle(document.body);
          return { background: style.backgroundColor, pattern: style.backgroundImage, font: style.fontFamily, text: style.color };
        });
        assert.deepEqual(current, original, `${file} matches the original ${theme} theme`);
      }
    }
  });
});

test('AI play has a compact header and asymmetric playground instead of homepage sections', async () => {
  await withPage(async page => {
    await page.goto(`${base}/ai-play.html`);
    assert.equal(await page.locator('.hero, .projects-grid, .project-card, .contact').count(), 0);
    const first = await page.locator('#honda-elevate').boundingBox();
    const second = await page.locator('#sage-interiors').boundingBox();
    assert.ok(first.y < 900, 'Projects begin within the first desktop viewport');
    assert.ok(second.x > first.x + first.width, 'Projects are arranged side by side');
    assert.ok(first.width > second.width * 1.2, 'The gallery has intentionally asymmetric columns');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/ai-play.html`);
    const mobileFirst = await page.locator('#honda-elevate').boundingBox();
    const mobileSecond = await page.locator('#sage-interiors').boundingBox();
    assert.equal(mobileFirst.x, mobileSecond.x);
    assert.ok(mobileSecond.y >= mobileFirst.y + mobileFirst.height, 'Mobile cards stack in reading order');
  });
});

test('AI play navigation cycles colors continuously except on the active page, including mobile menus', async () => {
  await withPage(async page => {
    for (const file of ['index.html', 'ai-play.html', 'clicks.html']) {
      await page.goto(`${base}/${file}`, { waitUntil: 'domcontentloaded' });
      const link = page.locator('.nav-links').getByRole('link', { name: 'AI play', exact: true });
      assert.equal(await link.getAttribute('href'), 'ai-play.html');
      const label = link.locator('.nav-ai-label');
      const active = file === 'ai-play.html';
      if (active) {
        assert.equal(await label.evaluate(element => element.getAnimations().length), 0);
        assert.equal(await label.evaluate(element => getComputedStyle(element).backgroundImage), 'none');
      } else {
        const shimmer = await label.evaluate(async element => {
          const animation = element.getAnimations()[0];
          await animation.ready;
          animation.currentTime = 0;
          const start = getComputedStyle(element).backgroundPosition;
          animation.currentTime = animation.effect.getTiming().duration / 2;
          const middle = getComputedStyle(element).backgroundPosition;
          animation.currentTime = animation.effect.getTiming().duration * 3.5;
          return { start, middle, state: animation.playState };
        });
        assert.notEqual(shimmer.start, shimmer.middle, 'Color bands travel across the text');
        assert.equal(shimmer.state, 'running', 'The shimmer keeps running after multiple cycles');
        const before = await label.evaluate(element => getComputedStyle(element).backgroundPosition);
        await page.waitForTimeout(120);
        assert.notEqual(await label.evaluate(element => getComputedStyle(element).backgroundPosition), before);
        assert.equal(await label.evaluate(element => getComputedStyle(element).backgroundClip), 'text');
      }
      await link.hover();
      await link.focus();
      assert.equal(await label.evaluate(element => element.getAnimations().length), active ? 0 : 1, 'Hover and focus do not override the active-page behavior');
      await page.setViewportSize({ width: 390, height: 844 });
      for (let opening = 0; opening < 2; opening++) {
        await page.locator('.nav-toggle').click();
        assert.equal(await page.locator('.mobile-menu .nav-ai-label').evaluate(element => element.getAnimations().length), active ? 0 : 1);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.mobile-menu .nav-ai-label').evaluate(element => element.getAnimations().length), 0);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });
});

test('global navigation follows the requested order without overlapping at desktop and mobile widths', async () => {
  await withPage(async page => {
    for (const file of ['index.html', 'ai-play.html', 'clicks.html']) {
      await page.goto(`${base}/${file}`);
      for (const menu of ['.nav-links', '.mobile-menu']) {
        assert.deepEqual(await page.locator(`${menu} a`).allTextContents().then(labels => labels.map(label => label.trim())),
          ['Work', 'About', 'Contact', 'AI play', 'Clicks', 'Resume'], `${file}: ${menu}`);
        assert.equal(await page.locator(`${menu} a svg, ${menu} a img, ${menu} .nav-ai-dot`).count(), 0, 'Navigation labels have no decorative icons');
        const styles = await page.locator(`${menu} a`).evaluateAll(links => links.slice(0, -1).map(link => {
          const style = getComputedStyle(link);
          return { size: style.fontSize, weight: style.fontWeight, padding: style.padding, background: style.backgroundColor, radius: style.borderRadius };
        }));
        for (const style of styles) assert.deepEqual(style, styles[0], `${file}: all plain links share the same styling in ${menu}`);
      }
      for (const width of [820, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        if (!await page.locator('.nav-links').isVisible()) continue;
        const bounds = await page.locator('.nav-logo, .nav-links a, .nav-right').evaluateAll(elements =>
          elements.map(element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
          }));
        for (let index = 1; index < bounds.length; index++) {
          assert.ok(bounds[index].left >= bounds[index - 1].right, `${file}: nav items do not overlap at ${width}px`);
        }
        for (let index = 2; index < bounds.length - 1; index++) {
          const gap = bounds[index].left - bounds[index - 1].right;
          assert.ok(Math.abs(gap - 28) < 1, `${file}: all nav links have an equal 28px gap at ${width}px`);
        }
        assert.ok(bounds[0].left >= 0 && bounds.at(-1).right <= width, 'Navigation stays inside the viewport');
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.nav-toggle').click();
      assert.equal(await page.locator('.mobile-menu').getByRole('link', { name: 'Clicks', exact: true }).isVisible(), true);
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });
});

test('navigation keeps plain links and a readable Resume pill on hover and focus in either theme', async () => {
  await withPage(async page => {
    for (const theme of ['light', 'dark']) {
      for (const file of ['index.html', 'ai-play.html', 'clicks.html']) {
        await page.goto(`${base}/${file}?clawpilotTheme=${theme}`);
        for (const menu of ['.nav-links', '.mobile-menu']) {
          if (menu === '.mobile-menu') {
            await page.setViewportSize({ width: 390, height: 844 });
            await page.locator('.nav-toggle').click();
          }
          const links = page.locator(`${menu} a`);
          const resume = links.last();
          const initialPill = await resume.evaluate(element => {
            const style = getComputedStyle(element);
            return { background: style.backgroundColor, text: style.color };
          });
          assert.equal(initialPill.background, await page.locator('body').evaluate(element => getComputedStyle(element).color), 'Resume has its contrasting filled oval');
          assert.equal(initialPill.text, await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'Resume text contrasts with the oval');
          for (const link of await links.all()) {
            const isResume = (await link.innerText()) === 'Resume';
            for (const interaction of ['hover', 'focus']) {
              await link[interaction]();
              const style = await link.evaluate(element => {
                const computed = getComputedStyle(element);
                return { background: computed.backgroundColor, image: computed.backgroundImage, shadow: computed.boxShadow, radius: parseFloat(computed.borderRadius), outline: computed.outlineStyle };
              });
              assert.equal(style.image, 'none');
              assert.equal(style.shadow, 'none');
              if (isResume) {
                assert.notEqual(style.background, 'rgba(0, 0, 0, 0)');
                assert.ok(style.radius >= 50, 'Resume remains oval');
              } else {
                assert.equal(style.background, 'rgba(0, 0, 0, 0)', `${file}: plain links stay background-free on ${interaction} in ${theme}`);
              }
              if (interaction === 'focus') {
                await page.keyboard.press('Tab');
                await link.focus();
                assert.equal(await link.evaluate(element => getComputedStyle(element).outlineStyle), 'solid', 'Keyboard focus stays visible');
              }
            }
          }
        }
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 1440, height: 900 });
      }
    }
  });
});

test('Clicks shares the main navigation and highlights the selected page on desktop and mobile', async () => {
  await withPage(async page => {
    for (const theme of ['light', 'dark']) {
      await page.goto(`${base}/index.html?clawpilotTheme=${theme}`);
      const readLinks = () => page.locator('.nav-links a').evaluateAll(links => links.map(link => {
        const url = new URL(link.href);
        return { label: link.textContent.trim(), target: url.pathname + url.hash };
      }));
      const originalLinks = await readLinks();
      await page.evaluate(theme => localStorage.setItem('theme', theme), theme);
      await page.goto(`${base}/ai-play.html`);
      const selectedColor = await page.locator('.nav-links a[aria-current="page"]').evaluate(element => getComputedStyle(element).color);
      await page.locator('.nav-links a[href="clicks.html"]').click();
      await page.waitForURL(/clicks\.html$/);
      assert.deepEqual(await readLinks(), originalLinks);
      assert.equal(await page.locator('.back-nav').count(), 0);
      const active = page.locator('.nav-links a[aria-current="page"]');
      assert.equal(await active.innerText(), 'Clicks');
      assert.equal(await active.evaluate(element => getComputedStyle(element).color), selectedColor);
      assert.equal(await active.evaluate(element => getComputedStyle(element).textDecorationLine), 'underline');
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.nav-toggle').click();
      assert.equal(await page.locator('.mobile-menu a[aria-current="page"]').innerText(), 'Clicks');
      assert.equal(await page.locator('.mobile-menu a[aria-current="page"]').evaluate(element => getComputedStyle(element).color), selectedColor);
      assert.equal(await page.locator('.mobile-menu a[aria-current="page"]').evaluate(element => getComputedStyle(element).textDecorationLine), 'underline');
      await page.locator('.mobile-menu a[href="ai-play.html"]').click();
      await page.waitForURL(/ai-play\.html$/);
      assert.equal(await page.locator('.nav-links a[aria-current="page"]').innerText(), 'AI play');
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });
});

test('mobile menu opens, closes on Escape and follows AI play', async () => {
  await withPage(async page => {
    await page.goto(`${base}/index.html`);
    const menu = page.locator('.nav-toggle');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    await menu.click();
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await menu.evaluate(element => element === document.activeElement), true);
    await menu.click();
    await page.locator('.mobile-menu a[href="ai-play.html"]').click();
    assert.match(page.url(), /ai-play\.html$/);
  }, { viewport: { width: 390, height: 844 } });
});

test('restored Microsoft journey stories still open and close', async () => {
  await withPage(async page => {
    await page.goto(`${base}/index.html`);
    await page.locator('#openStories').click();
    assert.equal(await page.locator('#storyViewer').evaluate(element => element.classList.contains('is-open')), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#storyViewer').evaluate(element => element.classList.contains('is-open')), false);
  });
});

test('AI play omits the removed controls and bottom note while keeping all projects', async () => {
  await withPage(async page => {
    await page.goto(`${base}/ai-play.html`);
    assert.equal(await page.locator('.lab-index, .lab-topline, .play-collage-caption, .project-toolbar, #project-search, #project-count, #no-projects, .lab-colophon, .experiment-notes, .experiment-card details').count(), 0);
    assert.equal(await page.locator('[data-project]:visible').count(), 4);
    const body = await page.locator('body').innerText();
    for (const text of ['Four things you can actually try.', 'Scroll to explore', 'Made out of curiosity. Still a work in progress.', 'Tell me what you think', 'The design question', 'build notes', 'Independent experiments / After hours', 'Back to selected work', 'Pick a rabbit hole.']) {
      assert.equal(body.includes(text), false, `Removed text: ${text}`);
    }
    assert.equal(await page.locator('.experiment-desc:visible').count(), 4);
    assert.equal(await page.locator('.experiment-link:visible').count(), 4);
  });
});

test('navigation shimmer stops on AI play and resumes after leaving it', async () => {
  await withPage(async page => {
    await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('.nav-links .nav-ai-label').evaluate(element => element.getAnimations()[0].playState), 'running');
    await page.locator('.nav-links a[href="ai-play.html"]').click();
    await page.waitForURL(/ai-play\.html$/);
    assert.equal(await page.locator('.nav-links .nav-ai-label').evaluate(element => element.getAnimations().length), 0);
    await page.locator('.nav-links a[href="clicks.html"]').click();
    await page.waitForURL(/clicks\.html$/);
    assert.equal(await page.locator('.nav-links .nav-ai-label').evaluate(element => element.getAnimations()[0].playState), 'running');
  });
});

test('playground and navigation respect reduced motion, including in the mobile menu', async () => {
  await withPage(async page => {
    for (const file of ['index.html', 'clicks.html', 'ai-play.html']) {
      await page.goto(`${base}/${file}`);
      await page.locator('.nav-links .nav-ai-link').focus();
      assert.equal(await page.locator('.nav-links .nav-ai-label').evaluate(element => getComputedStyle(element).animationName), 'none');
      assert.equal(await page.locator('.nav-links .nav-ai-label').evaluate(element => getComputedStyle(element).webkitTextFillColor === getComputedStyle(element).color), true, 'Reduced-motion text remains visible without its gradient');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.nav-toggle').click();
      await page.locator('.mobile-menu .nav-ai-link').focus();
      assert.equal(await page.locator('.mobile-menu .nav-ai-label').evaluate(element => getComputedStyle(element).animationName), 'none');
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    assert.equal(await page.locator('.lab-mark').evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    assert.equal(await page.locator('.play-toy').first().evaluate(element => getComputedStyle(element).animationName), 'none');
    assert.equal(await page.getByRole('button', { name: 'Motion reduced' }).isDisabled(), true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(await page.locator('.nav-links .nav-ai-label').evaluate(element => getComputedStyle(element).animationName), 'none', 'The active AI page stays still even when motion is enabled');
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.nav-links .nav-ai-label')).animationName !== 'none');
  }, { reducedMotion: 'reduce' });
});

test('playground preserves floating previews, pause control and project jump links', async () => {
  await withPage(async page => {
    await page.goto(`${base}/ai-play.html`);
    const toy = page.locator('.play-toy--car');
    await page.waitForFunction(() => document.querySelector('.play-collage').classList.contains('is-play-active'));
    const before = await toy.evaluate(element => getComputedStyle(element).transform);
    await page.waitForTimeout(120);
    assert.notEqual(await toy.evaluate(element => getComputedStyle(element).transform), before);
    await page.getByRole('button', { name: 'Pause motion' }).click();
    const pausedAt = await toy.evaluate(async element => {
      const animation = element.getAnimations()[0];
      await animation.ready;
      return animation.currentTime;
    });
    await page.waitForTimeout(120);
    assert.equal(await toy.evaluate(element => element.getAnimations()[0].currentTime), pausedAt);
    await page.getByRole('button', { name: 'Resume motion' }).click();
    await page.locator('.play-toy--room').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/#sage-interiors$/);
    assert.equal(await page.locator('#sage-interiors').isVisible(), true);
    await page.locator('#flight-171').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => !document.querySelector('.play-collage').classList.contains('is-play-active'));
  });
});

test('AI project titles match the gallery, accessible previews and launcher', async () => {
  await withPage(async page => {
    const projects = [
      ['honda-elevate', 'Honda Elevate breakdown'],
      ['sage-interiors', 'DIY interior design studio'],
      ['f1-racing', 'Formula 1 in BIC, India'],
      ['flight-171', 'Air India 171: The story'],
    ];
    await page.goto(`${base}/ai-play.html`);
    for (const [id, title] of projects) {
      const card = page.locator(`#${id}`);
      assert.equal(await card.locator('.experiment-name').innerText(), title);
      assert.ok((await card.locator('.experiment-image').getAttribute('aria-label')).includes(title));
      assert.equal(await page.locator('.play-collage').getByRole('link', { name: `Explore ${title}`, exact: true }).getAttribute('href'), `#${id}`);
      await card.locator('.experiment-name a').click();
      await page.waitForURL(`**/play.html?project=${id}`);
      assert.equal(await page.locator('#app-title').innerText(), title);
      assert.equal(await page.title(), `${title} — AI play`);
      assert.equal(await page.locator('#open-direct').getAttribute('href'), `projects/${id}/index.html?clawpilotTheme=dark`);
      await page.locator('#back-to-project').click();
      await page.waitForURL(`**/ai-play.html#${id}`);
    }
  });
});

test('playground preview links open the correct launcher by keyboard', async () => {
  await withPage(async page => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/ai-play.html`);
      await page.locator('#sage-interiors .experiment-image').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(/play\.html\?project=sage-interiors$/);
      assert.equal(await page.locator('#launch-button').isVisible(), true);
      assert.equal(await page.locator('iframe').count(), 0);
    }
  });
});

test('playground content and project links remain usable without JavaScript', async () => {
  await withPage(async page => {
    await page.goto(`${base}/ai-play.html`);
    assert.equal(await page.locator('[data-project]:visible').count(), 4);
    assert.equal(await page.locator('.experiment-card details').count(), 0);
    assert.equal(await page.locator('#sage-interiors .experiment-link').getAttribute('href'), 'play.html?project=sage-interiors');
  }, { javaScriptEnabled: false });
});

test('Clicks includes all four supplied films under Videos with the correct lightbox embeds', async () => {
  await withPage(async page => {
    await page.route('https://www.youtube.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<title>YouTube player test</title>' }));
    await page.goto(`${base}/clicks.html`);
    const ids = ['0Ia3-n1euzk', '5N6_n3byk5Q', 'hT9ghquCJ8s', 'azjupSKeK20'];
    assert.equal(await page.locator('#lightbox iframe').count(), 0, 'Videos do not load a player before selection');
    await page.locator('.cf-btn[data-filter="video"]').click();
    for (const id of ids) {
      const item = page.locator(`.click-item[data-src*="${id}"]`);
      assert.equal(await item.isVisible(), true);
      await item.focus();
      await page.keyboard.press('Enter');
      const player = page.locator('#lightbox iframe');
      assert.match(await player.getAttribute('src'), new RegExp(`/embed/${id}\\?`));
      assert.equal(await player.getAttribute('title'), await item.locator('img').getAttribute('alt'));
      assert.equal(await page.getByRole('link', { name: 'Watch on YouTube' }).getAttribute('href'), `https://www.youtube.com/watch?v=${id}`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#lightbox iframe').count(), 0);
    }
    await page.locator('.cf-btn[data-filter="photo"]').click();
    for (const id of ids) assert.equal(await page.locator(`.click-item[data-src*="${id}"]`).isVisible(), false);
    await page.locator('.cf-btn[data-filter="all"]').click();
    for (const id of ids) assert.equal(await page.locator(`.click-item[data-src*="${id}"]`).isVisible(), true);
  });
});

test('invalid project identifiers never load an arbitrary iframe', async () => {
  await withPage(async page => {
    for (const key of ['unknown', '__proto__', '../../index.html']) {
      await page.goto(`${base}/play.html?project=${encodeURIComponent(key)}`);
      assert.equal(await page.locator('iframe').count(), 0);
      assert.equal(await page.locator('#launch-button').isVisible(), false);
      assert.match(await page.locator('#launch-title').innerText(), /wasn't found/);
    }
  });
});

test('homepage, gallery and public case studies fit mobile, tablet and desktop', async () => {
  await withPage(async page => {
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const file of ['index.html', 'ai-play.html', 'dynamic-action-bar.html', 'user-onboarding.html']) {
        await page.goto(`${base}/${file}?clawpilotTheme=light`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${file} at ${width}px`);
        if (file === 'ai-play.html') {
          const ratios = await page.locator('.experiment-image').evaluateAll(images => images.map(image => {
            const box = image.getBoundingClientRect();
            const [numerator, denominator] = getComputedStyle(image).aspectRatio.split('/').map(Number);
            return { actual: box.width / box.height, intended: numerator / denominator };
          }));
          for (const ratio of ratios) assert.ok(Math.abs(ratio.actual - ratio.intended) < .02, `Preview aspect ratio at ${width}px: ${ratio.actual}`);
        }
      }
    }
  });
});

test('changed pages use exact-case local paths and valid local anchors', () => {
  const files = ['index.html', 'ai-play.html', 'play.html', 'dynamic-action-bar.html', 'user-onboarding.html', 'proactive-assistance.html', 'clicks.html'];
  for (const file of files) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [, reference] of content.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|tel:|data:)/.test(reference)) continue;
      const url = new URL(reference, `http://portfolio.local/${file}`);
      let destination = root;
      for (const segment of decodeURIComponent(url.pathname).split('/').filter(Boolean)) {
        assert.ok(fs.readdirSync(destination).includes(segment), `${file}: exact-case path ${reference}`);
        destination = path.join(destination, segment);
      }
      if (url.hash && destination.endsWith('.html')) {
        const target = fs.readFileSync(destination, 'utf8');
        assert.ok(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${file}: anchor ${reference}`);
      }
    }
  }
});

test('proactive assistance keeps its existing content gate', async () => {
  await withPage(async page => {
    await page.goto(`${base}/proactive-assistance.html`);
    await page.locator('#auth-overlay').waitFor();
    assert.equal(await page.locator('#auth-overlay').isVisible(), true);
    await page.evaluate(() => sessionStorage.setItem('pf_auth_v1', 'granted'));
    await page.reload();
    assert.equal(await page.locator('#auth-overlay').count(), 0);
    assert.equal(await page.locator('.proj-hero-title').isVisible(), true);
  });
});

async function launchProject(page, key) {
  await page.goto(`${base}/play.html?project=${key}`);
  assert.equal(await page.locator('iframe').count(), 0, 'No app loaded before explicit launch');
  assert.equal(await page.locator('#launch-note').isVisible(), true);
  await page.locator('#launch-button').click();
  await page.locator('iframe').waitFor();
  const frame = await page.locator('iframe').elementHandle().then(element => element.contentFrame());
  await frame.waitForLoadState('domcontentloaded');
  assert.match(await page.locator('#back-to-project').getAttribute('href'), new RegExp(`#${key}$`));
  return frame;
}

test('Honda export loads below a subpath and component selection updates the atlas', async () => {
  await withPage(async page => {
    await page.route(/sketchfab\.com/, route => route.abort());
    const frame = await launchProject(page, 'honda-elevate');
    await frame.getByRole('button', { name: /^Learning cutaway/i }).click();
    await frame.locator('canvas').waitFor();
    await frame.getByRole('button', { name: 'CVT transmission', exact: true }).first().click();
    assert.ok(await frame.getByRole('heading', { name: 'CVT transmission', exact: true }).isVisible());
    assert.equal(await frame.locator('canvas').count() > 0, true);
  });
});

test('Sage export renders and can save a liked room design', async () => {
  await withPage(async page => {
    const frame = await launchProject(page, 'sage-interiors');
    await frame.locator('canvas').first().waitFor();
    await frame.getByRole('button', { name: 'Like design', exact: true }).first().click();
    assert.equal(await frame.getByRole('button', { name: /Liked.*1/ }).isVisible(), true);
    await frame.getByRole('button', { name: /Dusty blue & cream/ }).click();
    assert.equal(await frame.getByRole('heading', { name: 'Dusty blue & cream', exact: true }).isVisible(), true);
  });
});

test('racing export starts a race and responds to keyboard throttle', async () => {
  await withPage(async page => {
    const frame = await launchProject(page, 'f1-racing');
    await frame.locator('#startBtn').click();
    await frame.locator('[data-code="NOR"]').click();
    await frame.locator('#commentaryToggle').uncheck();
    await frame.locator('#goBtn').click();
    await page.keyboard.press('Space');
    await frame.waitForFunction(() => window.f1?.started, null, { timeout: 30000 });
    await frame.locator('#scene').click({ position: { x: 700, y: 450 }, force: true });
    await page.keyboard.down('w');
    try {
      await frame.waitForFunction(() => Number(document.getElementById('speed').textContent) > 0, null, { timeout: 15000 });
    } finally {
      await page.keyboard.up('w');
    }
  });
});

test('Flight 171 export loads and its evidence ledger can be searched', async () => {
  await withPage(async page => {
    const frame = await launchProject(page, 'flight-171');
    await frame.getByRole('button', { name: 'Evidence ledger', exact: true }).click();
    await frame.getByPlaceholder('Search the timed sequence...').fill('Mayday');
    assert.equal(await frame.getByRole('heading', { name: 'The evidence ledger.', exact: true }).isVisible(), true);
    assert.equal(await frame.getByText('A Mayday call is transmitted', { exact: true }).isVisible(), true);
    assert.equal(await frame.getByText('V1 speed reached', { exact: true }).count(), 0);
  });
});
