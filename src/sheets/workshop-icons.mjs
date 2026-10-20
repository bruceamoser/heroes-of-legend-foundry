/** Approved workshop navigation paths (web/workshop.mjs). */
export const workshopNavIcons = {
  Main: '<path d="m4 3 13 13m-2 3 4-4M3 4l1 5 4-1M20 3 7 16m-2-1 4 4m12-15-1 5-4-1"/>',
  Abilities:
    '<path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
  Inventory:
    '<path d="M8 6V4a4 4 0 0 1 8 0v2M7 6h10l3 5v10H4V11zM4 13h16M9 13v3h6v-3"/>',
  Crafting: '<path d="M9 3h6M10 3v7L4 20h16l-6-10V3M7 15h10"/>',
  Character:
    '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',
  Development: '<path d="M5 21v-7h5V9h5V4h6M16 4h5v5"/>',
  Ancestry: '<path d="M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6zM8 11l3 3 5-6"/>',
  Origins: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  Class: '<path d="M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6zM12 6v11M8 10h8"/>',
  Heroic: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
  Review: '<path d="M8 3H4v18h16V3h-4M8 2h8v4H8zM7 13l3 3 7-7"/>',
};
export function workshopNavIcon(key) { return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${workshopNavIcons[key] ?? ""}</svg>`; }
