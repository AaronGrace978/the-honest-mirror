# The Honest Mirror 🪞

**A beauty camera that tells the truth.** YouCam Skin AI + Apparel Virtual Try-On, wrapped in an agentic honesty layer: no filters, real skin data, honest product recommendations — and receipts for every claim.

> Entry for the **Perfect Corp YouCam API Skin AI & eCommerce VTO Hackathon** (Devpost). Solo builder: Aaron Grace. Build agent: Cursor (Grok 4.7 Extra High).

---

## The pitch

Every beauty camera is a liar. Filters smooth, brighten, and flatter — then you meet the mirror and feel worse. Beauty apps monetize that gap: manufacture insecurity, sell the fix.

**The Honest Mirror inverts the business model.** It shows your real skin, reads it honestly (plain language, no scare tactics), and only recommends products the data actually supports — with a **Receipt** citing the exact metric that triggered each recommendation. If nothing is needed, it says so. The agent's loyalty is to your face, not the cart.

## Hackathon requirements (the rules we're playing by)

- **Integrate ≥1 YouCam API** — we use BOTH: **Skin Analysis** + **Apparel Virtual Try-On** (the same models behind 800+ brands)
- **Functional web prototype** — "complete product experience, not a proof of concept" (judges' words)
- **Public repo** ✓ this one
- **1–3 min YouTube demo** — judges stop watching at 3:00
- **Deadline: Nov 2, 11:45 AM EST** (re-verify on the Devpost submission page)
- **Free 1,000 API units** — redemption code arrives by email after registration; key goes in `.env` (NEVER committed)

## Judging criteria we're targeting

1. **Technological Implementation** — real YouCam API integration + agentic workflow (they explicitly invited "cutting-edge Agentic AI workflows")
2. **Design** — clean, calm, trustworthy UI; the anti-filter aesthetic
3. **Potential Impact** — trust-first beauty commerce
4. **Quality of Idea** — "creative, non-obvious use": an AI whose job is to *prevent* purchases

## Build spec (for the agent)

- **Stack:** vanilla HTML/CSS/JS single-page app (Devpost tags: javascript, html, css). No build step. Deployable to GitHub Pages.
- **Flow:** camera (getUserMedia) → YouCam Skin Analysis → honest plain-language readout → recommendations, each with a Receipt → optional Apparel VTO try-on
- **Honesty Agent (the differentiator):** audits every recommendation against the actual skin metrics. Refuses to upsell what the data doesn't support. Flags when a product is unnecessary. Confidence shown, never hidden.
- **No filters. Ever.** Include a "Truth toggle" that shows what the filtered version would have hidden.
- **Mobile-responsive.** Judges will open it on whatever they have.

## Deliverables checklist

- [ ] Working prototype at a public URL
- [ ] README updated with demo link + screenshots
- [ ] Devpost submission: description, screenshots, YouTube demo link
- [ ] Demo video ≤3:00 (script: hook → real skin scan → receipt → try-on → thesis)

## Status

- Devpost draft: submission 1265641 (story + tags saved)
- Repo: `AaronGrace978/the-honest-mirror`
- Next: Cursor agent builds the prototype from this spec
