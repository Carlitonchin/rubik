import { summarizeEvent } from '../input/ninja/describe';
import type { NinjaController } from '../input/ninja/ninja-controller';
import { HAND_COLORS } from './theme';

const VISIBLE_MS = 1400;
const MAX_ITEMS = 4;

/** Muestra cada movimiento ninja como una ficha que aparece y se desvanece, como un combo. */
export function mountMoveFeed(container: HTMLElement, ninja: NinjaController): void {
  container.insertAdjacentHTML('beforeend', '<div class="move-feed" aria-live="polite"></div>');
  const feed = container.querySelector<HTMLElement>('.move-feed')!;

  ninja.onEvent((event) => {
    const { symbol, label, side } = summarizeEvent(event);
    const item = document.createElement('div');
    item.className = 'move-feed-item';
    item.style.setProperty('--hand-color', side ? HAND_COLORS[side] : 'var(--accent)');
    item.innerHTML = `<span class="move-feed-symbol">${symbol}</span><span class="move-feed-label">${label}</span>`;
    feed.append(item);
    while (feed.children.length > MAX_ITEMS) feed.firstElementChild!.remove();
    setTimeout(() => item.classList.add('leaving'), VISIBLE_MS);
    setTimeout(() => item.remove(), VISIBLE_MS + 400);
  });
}
