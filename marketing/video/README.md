# Commish video kit

Scripts that make Commish TikTok clips in the Commish design system style (1080 x 1920, 30 fps, 120 BPM, original synthesised music). Not part of the website: nothing in this folder is served.

- render.py: shared drawing helpers (yellow glow background, glass phone, glass caption cards, logo coin, easing) and the how-to export video.
- promo.py: the 30s promo. Imports render.py; device mockups (phone, laptop), captions, beat-synced scenes, renders scenes in parallel then joins them.
- personal_bests.py: the 26s personal bests clip, built on promo.py.
- lost_commission.py: the 26s lost commission clip (shops most lost, Worth checking, copy order IDs).
- year_in_sales.py: the 26s launch clip for Commish 2026: Your Year in Sales. Uses phone screenshots of the story (demo data, reduced motion, focus blurred) and the saved card PNGs. All text left-aligned between x 80 and 860.
- music.py: synthesised deep-house groove (set BARS: 2s per bar at 120 BPM). Normalise with ffmpeg loudnorm I=-14.
- share.py: the 1200 x 630 share image.

## Setup in a fresh workspace
1. pip install fonttools brotli pillow numpy; ffmpeg and Playwright available.
2. Make the font: convert public/fonts/bricolage-latin.woff2 to bricolage.ttf with fontTools (flavor=None) and point render.R.FONT at it.
3. Capture demo-data screenshots with Playwright against `npx wrangler dev` (sign in as an ADMIN_EMAILS address via the dev link, click "Try it with demo data"); phone 390 x 844 at 3x, laptop 1440 x 900 at 1.5x, JPEG quality 92.
4. Paths at the top of each script assume /home/claude/...; adjust as needed.

## Rules
- Demo data only; never real names, handles, emails or contacts.
- TikTok safe zones: no text in the top 270px, bottom 380px, or right 140px from 700px down. Captions start at y = 300.
- Jamie prefers text kept to the left (x 80 to 860) so the profile picture and icons on the right never touch it.
- Cuts land on the beat (every 2 s or 0.5 s). One encoded file per scene, joined with the concat demuxer, music added with -c:v copy.
