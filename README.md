# Pludor World Prototype

A browser-first vertical slice of Pludor World: persistent-city presentation, avatar movement, nearby-player proximity interaction, commerce/work/land surfaces, and Pludor AI entry points.

## Run

Open `index.html` in a modern browser. The prototype uses Three.js from jsDelivr, so an internet connection is required.

### Controls
- WASD / arrow keys: move
- Approach another avatar: proximity actions appear
- Use the bottom navigation or contextual buttons to explore Shops, Land, Work, Social and AI

## Architecture intent
This prototype deliberately keeps World as a presentation/action layer. Production integration should reference Pludor's existing identity, messaging, voice, commerce, work/gig, land, rewards and AI/action systems instead of duplicating them.

## Next vertical slice
1. Connect authenticated Pludor identity.
2. Replace demo players with real-time presence.
3. Route Text/Voice into existing messaging/call APIs.
4. Link storefronts to existing products/cart/checkout.
5. Generalize UGC jobs into the Work Engine and place gigs spatially.
6. Persist parcels/buildings and add authoritative server-side state.
7. Add multiplayer transport (e.g. Colyseus/WebSocket layer) after the single-player interaction loop is validated.
