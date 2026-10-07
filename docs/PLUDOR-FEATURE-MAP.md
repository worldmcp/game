# Pludor World: game mode to Pludor feature map

This is the wiring guide for Pludor's engineers, and for any buyer who embeds Pludor World in their own product. It lists every in-game feature, the Pludor feature it belongs to, the adapter methods the host must implement, and what users and tenants can do.

> **Source note.** This map is built from the game's code: `src/pludor/contract.js`, `src/pludor/routes.js`, `src/config/economy.js` and `src/pludor/demo-adapter.js`. The live audit of pludor.com/features was not finished. Pludor feature names below are the ones the game already links to (Wayfare, Flika, Signals, Academy, AI Studio, Ads Manager, Dating, Live, Marketplace, Creator Hub, Wallet, Tools). Check each row against the live site before sign-off.

---

## 1. How game mode plugs in

```js
import { mountPludorWorld } from './src/index.js';
const world = await mountPludorWorld(el, {
  adapter,    // implements src/pludor/contract.js — Pludor's real APIs
  transport,  // realtime presence (WebSocket); see src/net/ws-transport.js
  me,         // { id, handle, displayName, color } of the signed-in user
  flags,      // feature switches, src/config/flags.js
  llm,        // optional (turns,{onText,signal}) => text  (Pludor AI)
  mode: 'embedded',
});
```

- **The host only wires APIs.** All gameplay, 3D rendering and UI are inside the game. Each namespace in the contract (below) maps to one existing Pludor system. `assertAdapter()` refuses to start if a method is missing.
- **The server is authoritative.** Balances, points, ownership, payouts, fees and rewards are computed by Pludor and never accepted from the client. Location-checked actions (pickups, drop-offs, collecting an order, rides) use the server's view of where the player is. Clients may only report the `CLIENT_REPORTABLE_EVENTS` (entering the world or a district, waving, talking and similar).
- **The reference implementation is complete.** `DemoPludorAdapter` (`src/pludor/demo-adapter.js` plus `economy-chain.js`) implements every method. `HttpPludorAdapter` turns each method into `POST {apiBase}/rpc/<ns.method>`. The sandbox server (`server/server.js`) shows the production shape: idempotency on every mutating call, rate limits, a WebSocket hub with movement validation, and an admin treasury view.
- **Deep links.** `links.open(key)` uses `src/pludor/routes.js`. Set each `path` to the real Pludor route and flip `confirmed: true`.
- **For buyers.** Implement the same contract against your own backend and keep the rules in the contract header. Nothing else changes.

---

## 2. Feature map

Status values:
- **Playable**: works end to end in the game and is tested.
- **Needs API**: the UI works, but production needs the real Pludor service behind the contract methods.
- **Partial**: some of the flow is missing; the note says what.

| Pludor feature | In-game experience | Contract methods | Status |
|---|---|---|---|
| Account & profile | HUD card, profile sheet, settings (name, presence, bio, birth year, dating opt-in) | `identity.getCurrentUser/updateProfile/getUser` | Needs API |
| Wallet | Top-bar balance, wallet sheet; every purchase is debited and every payout credited | `wallet.getWallet` (+ server-side debits/credits) | Needs API |
| Points | `pts` chip; earned with XP (`points.perXp 0.5`); spent on virtual goods; wallet money can cover missing points (`cashPerPoint 0.01`) | `wallet.getWallet`, `shop.*` | Playable |
| Shops & restaurants (commerce) | Walk into stores and food-court stalls, browse a catalog, order for pickup or delivery | `commerce.getBusiness/checkout/getOrders` | Playable |
| Merchant orders | Seller is told in real time, then accepts, marks ready or rejects; buyer tracks the order | `orders.incoming/accept/reject/ready/cancel/collect/track` | Playable |
| Wayfare Courier (delivery) | Delivery job board; walk to the shop, pick up, walk to the customer; payout on drop-off | `delivery.jobs/accept/pickup/dropoff` | Playable |
| Services & appointments | Barbers (Fade Lab), salons, repair: real time slots, booked and paid | `commerce.book` | Playable |
| Hotel & accommodation | Grand Hotel booths: an accommodation business sells stays as check-in slots | `commerce.book`, `land.rent(u-hb-*,'booth')` | Playable |
| Property / land | Rent street lots (storefront, studio, home), food stalls, hotel booths, cowork desks, apartments, market stalls | `land.listParcels/rent/openBusiness` | Playable |
| Business pages & branding | Logo, colour and tagline on the stall, booth or shop sign; product list; store manager | `business.setBrand/addProduct/removeProduct/mine`, `links.open('business.view'/'business.site')` | Playable (the mini-site is a deep link) |
| Business claim & verification | "Is this your business?" banner on unclaimed places | `business.claim`, `links.open('business.claim')` | Needs API |
| Reviews & feedback | Feedback on businesses | `business.feedback` | Needs API |
| Ads Manager | Walk up to any billboard, street panel, roof, wall or indoor frame and book it (price per day per placement); tap an ad to open the advertiser's shop | `ads.placementInfo/bookPlacement/getCreative/trackImpression/trackInteraction/getStats`, `links.open('ads.manager')` | Playable |
| Music promotion (Pludor Radio / Media) | Radio under the minimap (play, pause, skip, volume, video); artists pay per day for rotation | `radio.playlist/promote` | Playable (uploads play on the uploader's device only until Pludor Media hosting is wired) |
| Gigs / UGC (Work board) | Gig board at Hive Cowork and businesses: apply, be hired, submit, get paid from escrow; post your own gigs | `work.listGigs/getGig/apply/submit/createGig/hire/approve/myWork` | Playable |
| Academy (courses) | Pludor University faculties; finish courses to raise skills and unlock gigs | `learning.listCourses/getCourse/completeCourse/getSkills`, `links.open('academy.course')` | Playable |
| Events & Live | Event strip, tickets, attendance; conference centre screens; Go Live button | `events.listEvents/buyTicket/attend`, `links.open('live.event'/'live.goLive')` | Partial: in-world camera streaming is not built |
| Wayfare Rides (rider) | Request a ride from where you stand; fare held in escrow; driver comes to you; you arrive at the destination | `rides.quote/request/cancel/mine` | Playable |
| Wayfare Drive (driver) | Own a car, take ride requests, drive to pickup and drop-off; paid 85% of the fare | `rides.jobs/accept/pickup/dropoff`, `links.open('wayfare.drive')` | Playable |
| Car dealers / vehicles | Nova Motors showroom; scooter to hypercar priced by budget (points + money); cars park at home and can be driven | `shop.buyVirtual('car-*')` | Playable for virtual cars; Needs API for real dealer listings (use the commerce catalog) |
| Social | Nearby list, follow, friend, wave, block, mute, report | `social.*` | Needs API |
| Messages & voice | Chat sheet; consent-based voice call | `messaging.*`, `voice.*` | Partial: voice is consent UI only, WebRTC not built |
| Dating | Opt in (adults only); flirt with players and AI characters who also opted in | `identity.updateProfile({dating})`, `messaging.send`, `links.open('dating.*')` | Playable (gate) / Needs API |
| Nightlife 18+ | Pulse club; age-gated venue, drinks, tickets, events and 18+ ads | server checks `ageGate.adult` on checkout, book, tickets and ads | Playable |
| Pludor AI | "Ask Pludor AI" box, AI agents in the plaza, conversational NPCs | `ai.ask/askAgent`, `llm` option | Needs API (any LLM works) |
| Signals (communities) | Community hall | `world.listCommunities/joinCommunity`, `links.open('signals.community')` | Needs API |
| Flika (reels) | Cinema and reel screens | `world.listReels`, `links.open('flika.*')` | Needs API |
| AI Studio & free tools | Tools building (QR, invoice, logo, product photo, calculator) | `world.listTools/useTool`, `links.open('tools.*'/'aiStudio.*')` | Deep links |
| Marketplace (peer-to-peer) | Sell an item, buy listings | `commerce.createListing/listListings/buyListing` | Playable |
| Arcade games | Reaction Rush, Nova Trivia; results validated on the server, XP capped | `games.startGame/submitGame` | Playable |
| Avatar & virtual store | Avatar Studio: 16 bodies, skin, hair colour and style, top/bottoms/shoes with patterns, hats, eyewear, jewellery, watch, bags, aura; try on, then unlock in one checkout; 4 saved outfits | `identity.updateProfile({avatar,look,outfits})`, `shop.listVirtual/buyVirtual/buyBundle/owned` | Playable |
| Home & furnishing | Apartment/home interior shows owned virtual decor; real furniture via the furniture store catalog | `shop.buyVirtual('decor-*')`, `commerce.checkout` | Playable |
| Needs & lifestyle | Energy, hunger, social, fun, hygiene; sleep (needs an apartment, home or hotel stay), eat, rest on benches | `needs.getNeeds/performActivity` | Playable |
| Quests & levels | XP, ranks, badges, sponsored quests | `gamification.getProgress/track` | Needs API |
| Platform admin | Treasury by revenue type, audit log | `economy.treasury/fees/serviceCategories`, `/api/admin/overview` | Playable (sandbox) |
| Analytics | Funnel events | `analytics.track` | Needs API |

---

## 3. What users can do

**Earn money (paid to the Pludor Wallet)**
- Deliver orders as a courier.
- Drive riders with a car (85% of the fare).
- Complete gigs and UGC jobs (escrow released on approval).
- Sell from a rented stall, booth, market stall or shop.
- Sell second-hand items on the marketplace.
- Take bookings for services or hotel stays.
- Host paid events.

**Earn points:** points come with XP from exploring, learning, working, socialising and playing games. Points never become money.

**Spend**
- Food and goods: pickup or delivery.
- Appointments, hotel stays, event tickets, rides.
- Rent for land, apartments or business spots.
- Billboard and ad placements.
- Radio promotion.
- Virtual goods: cars, avatar wardrobe, home decor, storefront trim. Paid with points, points plus money, or money covering missing points.

**Socialise:** waves, follows, friends, chat, voice requests, AI characters, dating (adults only), events, communities, nightlife (adults only).

**Learn:** university courses raise skills, credibility and gig eligibility.

**Move around:** walk, sit on benches and chairs, enter every building, drive your own car with physics, call a ride, fast travel.

**Customise:** Avatar Studio (with saved outfits) and home decor.

**Live:** keep needs up by eating, sleeping in your apartment, home or hotel stay, freshening up and having fun.

---

## 4. What tenants and businesses can do

Every tenant follows the same chain: **rent a space, brand it, list products or services, receive orders or bookings, get paid.** Rent is paid weekly from the wallet. The platform fee is taken automatically.

| Tenant type | Space | Sells | Paid when | Platform fee |
|---|---|---|---|---|
| Food vendor | Food-court stall `u-fc-*` (or a street lot) | Menu items via the self-serve kiosk; pickup or delivery | Buyer collects, or courier drops off | `fees.commerce` 5% |
| Retailer / fashion / furniture | Storefront lot or market stall `u-mk-*` | Catalog products | Collected or delivered | 5% |
| Service provider (barber, salon, repair) | Storefront or booth | Bookable services with real time slots | Booking confirmed | 5% |
| Hotel / accommodation host | Hotel booth `u-hb-*` (category `accommodation`) | Stays as check-in slots; the booking counts as a bed for sleeping | Booking confirmed | 5% |
| Landlord / property | (Pludor-owned parcels in the demo) | Lots, apartments, desks and stalls rented per week | Rent debited | Rent goes to the platform |
| Advertiser | Any billboard, panel, roof, wall, banner or indoor frame | Ad creative that links to their shop or place | Up front per day: plaza $15, wall/roof $8–10, banner $6, street $4, indoor $3 | 100% platform |
| Music artist | Pludor Radio | Track in rotation for everyone | Up front | $2/day, platform |
| Creator / UGC / freelancer | Cowork desk `u-cw-*` | Gigs | Requester approves | `fees.gigs` 8% |
| Gig poster (any user or business) | — | Posts a gig, escrows the budget | — | 8% of the payout |
| Courier | — | Deliveries | Drop-off | `fees.delivery` 15% of the delivery fee |
| Ride-share driver | Own car (`vehicle: 'car'`) | Rides | Drop-off | `fees.rides` 15% |
| Marketplace seller | — | Second-hand listings | Sale | `fees.marketplace` 5% |
| Car dealer | Showroom place (Nova Motors) | Real cars via the commerce catalog | As commerce | 5% |
| Event host | Venues and conference centre | Tickets | Ticket sale | As commerce |

Branding (`business.setBrand`) takes a logo (emoji or a 160px image), a colour and a tagline. It shows on the stall, booth or shop sign for every player.

---

## 5. Money flows

Each flow is recorded in the platform ledger under a `treasury.byType` key (`economy.treasury`).

| Stream | Who pays | Who receives | Platform cut | `byType` key |
|---|---|---|---|---|
| Commerce orders | Buyer (escrow) | Seller | 5% | `commerce` |
| Delivery fee | Buyer | Courier | 15% | `delivery` |
| Bookings / stays | Buyer | Provider | 5% | `bookings` |
| Gigs | Poster (escrow) | Worker | 8% | `gigs` |
| Rides | Rider (escrow) | Driver 85% | 15% | `rides` |
| Ads | Advertiser | Platform | 100% | `ads` |
| Radio | Artist | Platform | 100% | `radio` |
| Virtual goods (money part and points top-up) | Player | Platform | 100% | `virtual` |
| Rent | Tenant | Platform (landlord) | 100% | rent |
| Marketplace | Buyer | Seller | 5% | `marketplace` |

`tests/e2e-economy.test.js` checks these flows against the real server with real accounts and WebSockets: sellers, buyers, drivers, artists and the treasury.

---

## 6. Gaps and next steps

1. **Wire the real APIs.** Implement `HttpPludorAdapter` endpoints (or swap the base URL) for every namespace marked "Needs API". Set `routes.js` paths and `confirmed: true`.
2. **Voice and Go Live.** Real voice and live streaming need Pludor's own WebRTC/SFU. The game has consent and room UI only.
3. **Verified age.** Replace the self-declared birth year with Pludor's verified age before showing 18+ content or dating.
4. **Real dealers and furniture.** Real car dealers and furniture stores list real products through the commerce catalog. The virtual cars and decor already exist.
5. **Media hosting.** Pludor Media should host radio uploads and business mini-site content.
6. **Audit pludor.com/features against this table.** Add a row for any site feature with no in-game counterpart.

---

## 7. Appendix: contract (namespace → methods)

```
identity     getCurrentUser, updateProfile, getUser
gamification getProgress, track
needs        getNeeds, performActivity
wallet       getWallet
social       getRelationship, addFriend, follow, block, mute, report
messaging    getConversation, listConversations, send
voice        requestCall, respondCall, endCall
commerce     getBusiness, checkout, book, getOrders, buyListing, listListings, createListing
business     claim, feedback, addProduct, removeProduct, mine, setBrand
orders       incoming, accept, reject, ready, cancel, collect, track
delivery     jobs, accept, pickup, dropoff
economy      treasury, fees, serviceCategories
work         listGigs, getGig, apply, submit, createGig, hire, approve, myWork
learning     listCourses, getCourse, completeCourse, getSkills
land         listParcels, rent, openBusiness
shop         listVirtual, buyVirtual, buyBundle, owned
radio        playlist, promote
rides        quote, request, cancel, mine, jobs, accept, pickup, dropoff
games        startGame, submitGame
ads          getCreative, trackImpression, trackInteraction, getStats, placementInfo, bookPlacement
events       listEvents, buyTicket, attend
world        collectToken, listTokens, worldRide, listCommunities, joinCommunity, listReels, listTools, useTool
ai           ask, askAgent
links        open
analytics    track
+ subscribe(fn)  — realtime events: order, merchant-order, delivery, ride, work, message, call, progress, state
```

**Deep links** (`src/pludor/routes.js`):

| Key | Path |
|---|---|
| `messaging.thread` | `/messages/:userId` |
| `voice.call` | `/calls/:userId` |
| `profile.view` | `/u/:handle` |
| `business.view` | `/b/:businessId` |
| `business.site` | `/b/:businessId/site` |
| `business.claim` | `/business/claim/:businessId` |
| `commerce.orders` | `/orders` |
| `wallet.view` | `/wallet` |
| `work.board` | `/work` |
| `work.ugcJob` | `/ugc/jobs/:jobId` |
| `academy.course` | `/academy/courses/:courseId` |
| `signals.community` | `/signals/:communityId` |
| `flika.home` | `/flika` |
| `flika.reel` | `/flika/:reelId` |
| `aiStudio.home` | `/ai-studio` |
| `aiStudio.tool` | `/ai-studio/:tool` |
| `ads.manager` | `/ads` |
| `ads.newWorldCampaign` | `/ads/new?placement=world` |
| `wayfare.rides` | `/wayfare/ride` |
| `wayfare.drive` | `/wayfare/drive` |
| `wayfare.courier` | `/wayfare/courier` |
| `wayfare.rentals` | `/wayfare/rentals` |
| `marketplace.listing` | `/marketplace/:listingId` |
| `creator.hub` | `/creators` |
| `creator.affiliate` | `/affiliate/:businessId` |
| `tools.*` | `/tools/{qr,invoice,logo,product-photo,calculator}` |
| `ai.assistant` | `/ai` |
| `live.event` | `/live/:eventId` |
| `live.goLive` | `/live/new` |
| `dating.home` | `/dating` |
| `dating.profile` | `/dating/u/:handle` |
