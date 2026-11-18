export const defaultOrder = ['menu', 'markets', 'giftcards', 'story', 'instagram', 'gallery', 'contact'];
export const layoutLabels = { menu: 'Menu (including fillings, sides & drinks)', markets: 'Locations', giftcards: 'Gift cards', story: 'Our story — Small kitchen. Big heart.', instagram: 'Latest from Instagram', gallery: 'Photo gallery', contact: 'Contact' };
export function validateOrder(order) {
  if (!Array.isArray(order) || order.length !== defaultOrder.length || new Set(order).size !== defaultOrder.length || order.some(id => !defaultOrder.includes(id))) throw Error('Choose each movable section exactly once.');
  return [...order];
}
export function applyOrder(document, order) {
  const ids = validateOrder(order), main = document.querySelector('#main');
  if (!main) return;
  const nodes = ids.map(id => document.getElementById(id));
  if (nodes.some(n => !n || n.parentElement !== main)) throw Error('A page section is missing.');
  const existing = [...main.children].filter(n => defaultOrder.includes(n.id)).map(n => n.id);
  if (existing.join() === ids.join()) return;
  for (const node of nodes) main.append(node);
}
