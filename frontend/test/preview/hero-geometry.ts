import { expect, type Page } from '@playwright/test';

// Scrollbar checks alone miss content clipped by an overflow-hidden ancestor.
// Check the actual loaded-font text bounds, including copy and action labels.
export async function expectHeroTextWithinViewport(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  const clipped = await page.getByRole('heading', { level: 1 }).locator('..').evaluate((hero) => {
    const viewport = document.documentElement.clientWidth;
    const walker = document.createTreeWalker(hero, NodeFilter.SHOW_TEXT);
    const clipped: Array<{ text: string; left: number; right: number; viewport: number }> = [];
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent?.trim();
      if (!text) continue;
      const range = document.createRange(); range.selectNode(walker.currentNode);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 && (rect.left < -1 || rect.right > viewport + 1)) {
          clipped.push({ text, left: rect.left, right: rect.right, viewport });
        }
      }
    }
    return clipped;
  });
  expect(clipped).toEqual([]);
}

export async function expectPublicHeadingsWithinViewport(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  const clipped = await page.locator('main h1, main h2, main h3').evaluateAll((headings) => {
    const viewport = document.documentElement.clientWidth;
    return headings.flatMap((heading) => {
      const range = document.createRange(); range.selectNodeContents(heading);
      return [...range.getClientRects()].filter((rect) => rect.width > 0 && (rect.left < -1 || rect.right > viewport + 1))
        .map((rect) => ({ text: heading.textContent, left: rect.left, right: rect.right, viewport }));
    });
  });
  expect(clipped).toEqual([]);
}
