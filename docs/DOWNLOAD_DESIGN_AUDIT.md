GATE: FAIL 31 (round 2 of 3)

17 November 2026 — Download page after the app-demo revision. No full design-gate pass is claimed. The homepage completed three review rounds. Download review completed two distinct rounds; a third unchanged invocation reused the second result rather than advancing the counter. No artificial file changes were made to consume a round.

## Scope and exceptions

Software / meeting workspace. The established paper/graphite system, self-hosted Geist/Editorial fonts, Keepsake identity and original ASCII hands are retained. New effects are original glass framing, monochrome reflective buttons, manual platform selection and finite sample text reveals. Actual app code loads only after an explicit Try action. All native downloads remain coming soon. No external stock image or invented release date was introduced.

Existing waivers remain unchanged: the retained homepage headline is named by the user; original CSS motion supplies hover/press/entrance without the kit stylesheet; the actual hero entrance does not use the kit-specific class. Homepage-only exceptions are ignored when they do not match the download page. No new exceptions were added.

Real contrast and phone tap-target findings found during review were corrected. Remaining findings largely concern the kit's prescribed full-screen sections, its single-heading/container convention versus a nested product UI, and required dealt moments. We retain a compact page and an interactive app window. The final small hero demo-link readability adjustment is covered by the subsequent responsive browser check rather than a fourth homepage design round.

Functional browser checks pass at six widths. The actual app sandbox was verified at desktop and phone widths, including editing notes, transcript navigation, local answers, no provider traffic, reset on close and no change to a separately persisted workspace. Tablet, desktop and phone screenshots were reviewed. The full kit performance audit was not run; Vite still warns about the pre-existing app bundle size, mitigated here by click-to-load framing. No physical audio or native platform verification is claimed.

## Open findings

1. **sample-label     div.device-cradle > div.demo-window > div.demo-window-foot > span "Sample content · No mic  [1440]**

   a note that the page's names or figures are examples ("Sample content"): it reads as an apology and undercuts every claim

2. **nesting          div.device-cradle > div.demo-window > div.demo-tour-body > aside.demo-rail "YOUR WORKSPACE  [1440]**

   3 boxes deep: div.device-cradle > div.demo-window > aside.demo-rail (text in a box in a box)

3. **button-styles    (the page)  [1440]**

   3 button styles on the page: soft, fill #ffffff, outline #d9dcd3 x1 ("GitHub ★ 0"); soft, fill #242524, outline #383b36 x1 ("Try the app ↗"); pill, fill gradient, outline #ffffff x1 ("Try the app ↗")

4. **same-action      header.site-header.wrap > div.header-actions > a.button.primary "Try the app ↗"  [1440]**

   "Try the app ↗" appears 2 times in different looks: soft, fill #242524, outline #383b36 and pill, fill gradient, outline #ffffff

5. **copy-headline    h1#download-title "Good conversations. Better company."  [1440]**

   "Good conversations. Better company." does not name what is sold (meeting workspace, meeting, workspace, from flags); only the line under it does

6. **centre-axis      section.download-experience.wrap > div.download-release > p > strong.selected-platform "Bu  [1440, 390]**

   centred text 41px left of the middle of its page (679px against 720px)

7. **centre-axis      section.download-experience.wrap > div.download-release > p > span.release-separator "/"  [1440, 390]**

   centred text 19px right of the middle of its page (739px against 720px)

8. **fold-action      div.device-cradle > div.demo-window > div.demo-window-foot > button.sheen-button:nth-of-ty  [1440, 390]**

   the hero's main button "Try the app ↗" starts 70px below the first screen (900px tall): it is not seen on load

9. **heading-order    div.demo-tour-body:nth-of-type(2) > div.demo-tour-main > div.demo-workspace-body:nth-of-ty  [1440]**

   "Product check-in" is an h3 after an h1: a level is skipped

10. **moment-none      (the page)  [1440]**

   a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md)

11. **hero-screen      main#main > section.download-experience.wrap "BUDDY / DESKTOP + MOBILEGood conversatio"  [1440]**

   the hero ends at 1219px on a 900px screen, 319px below the fold: it ends at the fold, 1px either way (SR-1)

12. **section-height   footer.site-footer.wrap "buddy.Source · AGPL-3.0Privacy© 2026 Bud"  [1440]**

   the section is 127px tall (0.1 screens), 773px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)

13. **one-section      footer.site-footer.wrap "buddy.Source · AGPL-3.0Privacy© 2026 Bud"  [1440]**

   the screen at scroll 446px (the top of section 2) shows 127px of section 2 and the content of 2 sections, over 24px each beside section 1: a screen shows one section (another may peek 8px, 24px WARN) (SR-4)

14. **one-section      div#device-preview > div.device-cradle > div.demo-window > div.demo-window-foot "Sample co  [1440]**

   a band: a box 88% of the section wide on a ground of its own that holds only text: the section's own ground is the band (SR-4)

15. **container-edges  header.site-header.wrap "buddy. The workspaceYour setup GitHub★0T"  [1440]**

   the nav's content runs 160px from the left and 160px from the right (read from its outermost blocks: no .wrap): the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6)

16. **container-edges  main#main > section.download-experience.wrap "BUDDY / DESKTOP + MOBILEGood conversatio"  [1440]**

   the content of section 1 runs 160px from the left and 160px from the right (read from its outermost blocks: no .wrap): the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (and 1 more like it:

17. **container-edges  a.skip-link "Skip to content"  [1440]**

   a <a> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6)

18. **container-edges  div#device-preview > div.fluted-light  [1440]**

   a box runs 130-1310px, outside the container lines of section 1 at 160-1280px: full width is for background layers and grounds only (SR-6)

19. **container-edges  section.download-experience.wrap > div.download-release > p > strong.selected-platform "Bu  [1440]**

   1 text block starts on a left line at x 634, 474px from the container's left: text starts on the container's left, or on one split line (x 637, 732, 827) (SR-6)

20. **container-edges  main#main > section.download-experience.wrap > div.download-bottom > p "No install needed   [1440]**

   1 text block starts on a left line at x 479, 319px from the container's left: text starts on the container's left, or on one split line (x 637, 732, 827) (and 3 more like it: x 446, x 434, x 251) (SR-6)

21. **container-edges  main#main > section.download-experience.wrap > div.platform-dock "macOSComing soonWindowsC  [1440]**

   a box over half the container wide runs 395-1045px, not on the container's lines at 160-1280px (and 2 more like it: "buddy.GUIDED PREVIEWOpen", div#device-preview > div.fluted-light) (SR-6)

22. **split-pair       div.demo-tour-body > div.demo-tour-main > div.demo-workspace-body > div.demo-record-column  [1440]**

   the split's columns are off the page's one pair of lines: its right column starts at x 856, on none of the split lines 637 (k=5), 732 (k=6), 827 (k=7) (SR-8)

23. **edge-left        section.download-experience.wrap p.eyebrow "MY MEETINGS / PRODUCT CHECK-IN"  [1440]**

   starts at x 434; the lines are 160 and the column starts

24. **edge-left        section.download-experience.wrap p.eyebrow "YOUR MEETING SPACE"  [1440]**

   starts at x 434; the lines are 160 and the column starts

25. **edge-left        section.download-experience.wrap h3 "Product check-in"  [1440]**

   starts at x 434; the lines are 160 and the column starts

26. **edge-left        section.download-experience.wrap p.sample-caption "Let’s test the new welcome flow "  [1440]**

   starts at x 434; the lines are 160 and the column starts

27. **edge-left        section.download-experience.wrap p.eyebrow "YOUR NOTES"  [1440]**

   starts at x 882.1; the lines are 160 and the column starts

28. **edge-left        section.download-experience.wrap p "Keep the first release focused."  [1440]**

   starts at x 882.1; the lines are 160 and the column starts

29. **edge-left        section.download-experience.wrap p.demo-note-foot "The next step, kept in context."  [1440]**

   starts at x 882.1; the lines are 160 and the column starts

30. **edge-left        section.download-experience.wrap p "No install needed to take a look"  [1440]**

   starts at x 479.1; the lines are 160 and the column starts

31. **hero-fold        section.download-experience.wrap section.download-experience.wrap "BUDDY / DESKTOP + MOBIL  [1440, 390]**

   ends at y 1219, past the fold (900): 1.35 screens tall

## Warnings

12 WARN (not blocking), first: copy-buttons header.site-header.wrap > div.header-act; centre-axis main#main > section.download-experience.; centre-axis main#main > section.download-experience.; copy-length main#main > section.download-experience.; tap-size header.site-header.wrap > a.wordmark "bu

See `WEBSITE_APP_DEMO.md` for component references, storage isolation and verification scope. Raw checker output remains an ignored local build artifact.
