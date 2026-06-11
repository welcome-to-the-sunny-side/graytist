// Minimal hyperscript helper for building settings UI without a framework.
type Props = Record<string, unknown> & { class?: string };

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = String(v);
    else (node as Record<string, unknown>)[k] = v;
  }
  node.append(...children);
  return node;
}
