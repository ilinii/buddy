GATE: OPEN 30 (rounds used up)

17 November 2026. Three permitted review rounds completed. This is not a full design-gate pass.

## Design and review scope

Software / meeting workspace. The page retains Buddy's existing warm paper, graphite, Geist/Editorial typography and approved Keepsake identity. The effect is an original CSS waveform inside an explicitly illustrative meeting preview; four neutral glass platform cards carry the requested availability. The hero enters once; card hover and pause/reduced-motion controls are present. No new photography, third-party illustration, coined name, fake signup form or invented release date was introduced.

Desktop (1440/1024), tablet (820/768) and phone (390) screenshots were inspected. Browser assertions additionally cover 320 px. TypeScript, 62 unit tests, production/static exports, logo decoding, navigation and motion checks passed. The static-only export fallback was checked separately. The full kit performance audit was not run. No native-platform or physical-audio acceptance is claimed.

The compact page, four platform headings and nested meeting UI remain. They do not match all of the kit's full-screen, single-heading and edge conventions. The missing hero download action is deliberate: the user requires all platforms to be coming soon; working trial/workspace links are available in the header and closing invitation. No checker code or hidden content was used to suppress findings.

## Applicable exception

The existing motion-layer waiver applies: Buddy uses its own CSS hover/press/entrance rules rather than the kit stylesheet. The other homepage-specific waivers do not match this page and were ignored by the checker. No new waivers were added.

## Open findings

1. **cta              main#main > section.download-hero.wrap  [1440, 390]**

   the hero has no button (the nav's does not count)

2. **copy-headline    h1#download-title "Take Buddy with you."  [1440]**

   "Take Buddy with you." does not name what is sold (meeting notes, meeting, notes, from flags); only the line under it does

3. **copy-headings    h2#platform-mac "macOS"  [1440]**

   "macOS" names no product, part, place or section (2 headings like it; at most one brand line per page) (and 1 more like it: "iOS")

4. **moment-none      (the page)  [1440]**

   a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md)

5. **section-height   footer.site-footer.wrap "buddy.Source · AGPL-3.0Privacy© 2026 Bud"  [1440]**

   the section is 124px tall (0.1 screens), 776px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)

6. **section-height   main#main > aside.download-invitation.wrap "IN THE MEANTIMEHear what Buddy can do.Tr"  [1440]**

   the section is 142px tall (0.2 screens), 758px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)

7. **one-section      main#main > aside.download-invitation.wrap > div > h2 "Hear what Buddy can do."  [1440]**

   the screen at scroll 266px (the top of section 2) shows 142px of section 2 and the heading of section 2 whole and the content of 3 sections, over 24px each beside section 1: a screen shows one section (another may peek 8

8. **one-heading      div.pocket-meeting.app-frame > div.pocket-content > div.pocket-heading > h2 "Product check  [1440]**

   the hero holds an h2 (5): its heading is the h1, and an h2 opens the next section (SR-5)

9. **one-heading      main#main > aside.download-invitation.wrap > div > h2 "Hear what Buddy can do."  [1440]**

   headings of two sections show whole on one screen at 4 of 6 scroll positions (66.7%; at scroll 100, 150, 200, 250px), here with "Product check-in": at most 3% on a desktop (SR-5)

10. **container-edges  header.site-header.wrap "buddy. The workspaceYour setup GitHub★0T"  [1440]**

   the nav's content runs 160px from the left and 160px from the right (read from its outermost blocks: no .wrap): the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6)

11. **container-edges  main#main > section.download-hero.wrap "BUDDY / DESKTOP + MOBILE Take Buddywith "  [1440]**

   the content of section 1 runs 160px from the left and 160px from the right (read from its outermost blocks: no .wrap): the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6)

12. **container-edges  main#main > aside.download-invitation.wrap "IN THE MEANTIMEHear what Buddy can do.Tr"  [1440]**

   the content of section 2 runs 160px from the left and 160px from the right (read from its outermost blocks: no .wrap): the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (and 1 more like it:

13. **container-edges  a.skip-link "Skip to content"  [1440]**

   a <a> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6)

14. **container-edges  footer.site-footer.wrap "buddy.Source · AGPL-3.0Privacy© 2026 Bud"  [1440]**

   a <footer> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (and 4 more like it: "ⅡPause motion", "BUDDY / DESKTOP + MOBILE", "IN THE MEANTIMEHear what") (SR-6)

15. **container-edges  h2#platform-windows "Windows"  [1440]**

   the h2 starts 897px right of the container's left: every h1 and h2 starts on it, 2px either way (SR-6)

16. **container-edges  h2#platform-android "Android"  [1440]**

   the h2 starts 897px right of the container's left: every h1 and h2 starts on it, 2px either way (and 3 more like it: "macOS", "iOS", "Product check-in") (SR-6)

17. **hero-fill        main#main > aside.download-invitation.wrap "Hear what Buddy can do."  [768]**

   the next section shows on the first screen: it starts at 790px on a 1024px screen (the hero ends at 760px)

18. **edge-left        section.download-hero.wrap h2 "Product check-in"  [1440, 390]**

   starts at x 181; the lines are 160 and the column starts

19. **edge-left        section.download-hero.wrap p.pocket-quote "“Let’s test the welcome flow bef"  [1440, 390]**

   starts at x 181; the lines are 160 and the column starts

20. **edge-left        section.download-hero.wrap p "Next step Test the welcome flow "  [1440, 390]**

   starts at x 204; the lines are 160 and the column starts

21. **edge-left        section.download-hero.wrap p.eyebrow "CHOOSE YOUR DEVICE"  [1440]**

   starts at x 770; the lines are 160 and the column starts

22. **edge-left        section.download-hero.wrap p.platform-category "DESKTOP"  [1440, 390]**

   starts at x 795; the lines are 160 and the column starts

23. **edge-left        section.download-hero.wrap h2 "macOS"  [1440, 390]**

   starts at x 795; the lines are 160 and the column starts

24. **edge-left        section.download-hero.wrap h2 "Windows"  [1440, 390]**

   starts at x 1057; the lines are 160 and the column starts

25. **edge-left        section.download-hero.wrap p.platform-category "MOBILE"  [1440, 390]**

   starts at x 795; the lines are 160 and the column starts

26. **edge-left        section.download-hero.wrap h2 "iOS"  [1440, 390]**

   starts at x 795; the lines are 160 and the column starts

27. **edge-left        section.download-hero.wrap h2 "Android"  [1440, 390]**

   starts at x 1057; the lines are 160 and the column starts

28. **edge-left        section.download-hero.wrap p.release-note "All four apps are coming soon. W"  [1440]**

   starts at x 770; the lines are 160 and the column starts

29. **lines            page  [1440, 390]**

   headings and leads start on 4 lines (x 160, 181, 795, 1057); the page has 160 and one split line

30. **hero-fold        section.download-hero.wrap section.download-hero.wrap "BUDDY / DESKTOP + MOBILE Take Bu"  [390]**

   ends at y 1221, past the fold (844): 1.45 screens tall

## Warnings

16 WARN (not blocking), first: copy-buttons header.site-header.wrap > div.header-act; copy-actions header.site-header.wrap > div.header-act; copy-actions (the page); heading-scale h2#platform-mac "macOS"; section-gaps main#main > section.download-hero.wrap /

The full checker output is a local ignored artifact at `output/download-design-gate-final.txt`.
