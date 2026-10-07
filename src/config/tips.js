// Guidance bubbles that pop up above "Ask Pludor AI" now and then. Content
// lives here so product/ops can edit it without touching UI code.
// action: a sheet to open ({ sheet, props }) or a place to visit ({ visit }).

export const TIPS = [
  { icon: '📦', text: 'Things you buy in the World get delivered. Some are virtual goods (outfits, decor, cars); others are real products and services from real businesses.', action: { sheet: 'shops' }, cta: 'Browse shops' },
  { icon: '💸', text: 'Money you earn selling products or offering services goes straight to your Pludor Wallet. Points are different: they power your day-to-day lifestyle in the game.', action: { sheet: 'wallet' }, cta: 'Open wallet' },
  { icon: '⭐', text: 'Spend Points (plus wallet money for premium items) on virtual Pludor assets: clothes, cars, home decor and building upgrades.', action: { sheet: 'vstore' }, cta: 'Pludor Store' },
  { icon: '🎓', text: 'Pludor University: finish courses in Business, Creative Media, Tech, Hospitality and Trades to raise your credibility and unlock better-paying gigs.', action: { visit: 'academy' }, cta: 'Go to University' },
  { icon: '🍜', text: 'Hungry? Order from a Skyline Food Court stall at the self-serve kiosk. A player courier brings it to you.', action: { visit: 'food-court' }, cta: 'Food court' },
  { icon: '🔑', text: 'Food stalls, hotel and expo booths, cowork desks and apartments are all for rent. Open your business inside a busy venue.', action: { sheet: 'land' }, cta: 'See spots' },
  { icon: '🏢', text: 'Rent an apartment at Nova Heights to sleep, shower and restore energy. The 🏠 button takes you straight home.', action: { visit: 'nova-heights' }, cta: 'Nova Heights' },
  { icon: '🛵', text: 'Earn by delivering: restaurants hand orders to player couriers. Pick up jobs in Earn → Deliveries.', action: { sheet: 'work', props: { tab: 'deliveries' } }, cta: 'Courier jobs' },
  { icon: '🎨', text: 'Make it you: tap your portrait to open the Avatar Studio. Change skin tone, hair, outfit, shape and accessories.', action: { sheet: 'avatar' }, cta: 'Avatar Studio' },
  { icon: '📣', text: 'Every billboard and screen in the city is ad space. Promote your business with Pludor Ads.', action: { sheet: 'land' }, cta: 'Grow my business' },
  { icon: '🤝', text: 'Walk up to anyone and press E to talk, wave or start a voice call. Real people are real customers.', action: null },
  { icon: '🔴', text: 'Creators stream live onto the screens at Flika Cinema and the Summit Conference Center.', action: { visit: 'summit-center' }, cta: 'Watch live' },
];
