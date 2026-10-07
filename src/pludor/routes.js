// Deep-link targets into the existing Pludor app. These paths are
// PLACEHOLDERS: the Pludor codebase was not available when this was written,
// so each one must be confirmed against the real router before launch.
// `confirmed: false` makes the UI say so instead of silently pretending.

export const PLUDOR_ROUTES = {
  'messaging.thread': { path: '/messages/:userId', label: 'Pludor Messages', confirmed: false },
  'voice.call': { path: '/calls/:userId', label: 'Pludor Voice', confirmed: false },
  'profile.view': { path: '/u/:handle', label: 'Profile', confirmed: false },
  'business.view': { path: '/b/:businessId', label: 'Business page', confirmed: false },
  'business.claim': { path: '/business/claim/:businessId', label: 'Business verification', confirmed: false },
  'commerce.orders': { path: '/orders', label: 'Orders', confirmed: false },
  'wallet.view': { path: '/wallet', label: 'Wallet', confirmed: false },
  'work.board': { path: '/work', label: 'Work board', confirmed: false },
  'work.ugcJob': { path: '/ugc/jobs/:jobId', label: 'UGC job', confirmed: false },
  'academy.course': { path: '/academy/courses/:courseId', label: 'Academy course', confirmed: false },
  'signals.community': { path: '/signals/:communityId', label: 'Signals', confirmed: false },
  'flika.reel': { path: '/flika/:reelId', label: 'Flika', confirmed: false },
  'flika.home': { path: '/flika', label: 'Flika', confirmed: false },
  'aiStudio.home': { path: '/ai-studio', label: 'AI Studio', confirmed: false },
  'aiStudio.tool': { path: '/ai-studio/:tool', label: 'AI Studio', confirmed: false },
  'ads.manager': { path: '/ads', label: 'Ads Manager', confirmed: false },
  'ads.newWorldCampaign': { path: '/ads/new?placement=world', label: 'Ads Manager', confirmed: false },
  'wayfare.rides': { path: '/wayfare/ride', label: 'Wayfare Rides', confirmed: false },
  'wayfare.courier': { path: '/wayfare/courier', label: 'Wayfare Courier', confirmed: false },
  'wayfare.rentals': { path: '/wayfare/rentals', label: 'Wayfare Rentals', confirmed: false },
  'marketplace.listing': { path: '/marketplace/:listingId', label: 'Marketplace', confirmed: false },
  'creator.hub': { path: '/creators', label: 'Creator Hub', confirmed: false },
  'creator.affiliate': { path: '/affiliate/:businessId', label: 'Affiliate program', confirmed: false },
  'tools.qr': { path: '/tools/qr', label: 'QR Generator', confirmed: false },
  'tools.invoice': { path: '/tools/invoice', label: 'Invoice Maker', confirmed: false },
  'tools.logo': { path: '/tools/logo', label: 'Logo Maker', confirmed: false },
  'tools.productPhoto': { path: '/tools/product-photo', label: 'Product Photo Studio', confirmed: false },
  'tools.calculator': { path: '/tools/calculator', label: 'Profit Calculator', confirmed: false },
  'ai.assistant': { path: '/ai', label: 'Pludor AI', confirmed: false },
  'live.event': { path: '/live/:eventId', label: 'Live', confirmed: false },
  'live.goLive': { path: '/live/new', label: 'Go Live', confirmed: false },
  'dating.home': { path: '/dating', label: 'Pludor Dating', confirmed: false },
  'dating.profile': { path: '/dating/u/:handle', label: 'Pludor Dating profile', confirmed: false },
  'wayfare.drive': { path: '/wayfare/drive', label: 'Drive with Wayfare', confirmed: false },
  'business.site': { path: '/b/:businessId/site', label: 'Business website', confirmed: false },
};

export function resolveRoute(key, params = {}) {
  const r = PLUDOR_ROUTES[key];
  if (!r) return null;
  const path = r.path.replace(/:([a-zA-Z]+)/g, (_, k) => encodeURIComponent(params[k] ?? `:${k}`));
  return { key, path, label: r.label, confirmed: r.confirmed };
}
