GATE: OPEN 48 (rounds used up)

17 November 2026 — Homepage after the app-demo revision. No full design-gate pass is claimed. The homepage completed three review rounds. Download review completed two distinct rounds; a third unchanged invocation reused the second result rather than advancing the counter. No artificial file changes were made to consume a round.

## Scope and exceptions

Software / meeting workspace. The established paper/graphite system, self-hosted Geist/Editorial fonts, Keepsake identity and original ASCII hands are retained. New effects are original glass framing, monochrome reflective buttons, manual platform selection and finite sample text reveals. Actual app code loads only after an explicit Try action. All native downloads remain coming soon. No external stock image or invented release date was introduced.

Existing waivers remain unchanged: the retained homepage headline is named by the user; original CSS motion supplies hover/press/entrance without the kit stylesheet; the actual hero entrance does not use the kit-specific class. Homepage-only exceptions are ignored when they do not match the download page. No new exceptions were added.

Real contrast and phone tap-target findings found during review were corrected. Remaining findings largely concern the kit's prescribed full-screen sections, its single-heading/container convention versus a nested product UI, and required dealt moments. We retain a compact page and an interactive app window. The final small hero demo-link readability adjustment is covered by the subsequent responsive browser check rather than a fourth homepage design round.

Functional browser checks pass at six widths. The actual app sandbox was verified at desktop and phone widths, including editing notes, transcript navigation, local answers, no provider traffic, reset on close and no change to a separately persisted workspace. Tablet, desktop and phone screenshots were reviewed. The full kit performance audit was not run; Vite still warns about the pre-existing app bundle size, mitigated here by click-to-load framing. No physical audio or native platform verification is claimed.

## Open findings

1. **sample-label     div.workspace-tour > div.demo-window > div.demo-window-foot > span "Sample content · No mi  [1440]**

   a note that the page's names or figures are examples ("Sample content"): it reads as an apology and undercuts every claim

2. **no-visual        section#product "Your meeting. All the context."  [1440, 390]**

   no picture, effect or mock in this section; a feature section needs a visual

3. **text-only        section#questions "Before your first meeting."  [1440, 390]**

   the closing section is only text: no picture, icon, mock or effect in it

4. **button-styles    (the page)  [1440, 390]**

   3 button styles on the page: soft, fill #ffffff, outline #d9dcd3 x1 ("GitHub ★ 0"); soft, fill #242524, outline #383b36 x3 ("Download now ↗"); pill, fill gradient, outline #ffffff x1 ("Try the app ↗")

5. **cta              section#questions "Before your first meeting."  [1440, 390]**

   the last section before the footer ends with no button

6. **heading-scale    h2#privacy-title "Your AI. On your terms."  [1440, 390]**

   h2 headings in 3 sizes, 38px ("Before your first meetin") to 60px (x1.58)

7. **focus-visible    div.workspace-tour:nth-of-type(2) > div.demo-window > div.demo-window-bar:nth-of-type(1) >  [1440]**

   Tab stop 11, a "Open in a tab ↗": its focus change is faint: 1.27:1 against the ground, 3:1 needed

8. **focus-visible    button#step-record "Record"  [1440]**

   Tab stop 12, button "Record": its focus change is faint: 1.12:1 against the ground, 3:1 needed

9. **focus-visible    div#workflow-panel "Record"  [1440]**

   Tab stop 13, div "Record": its focus change is faint: 1.25:1 against the ground, 3:1 needed

10. **focus-visible    div.workspace-tour:nth-of-type(2) > div.demo-window > div.demo-window-foot:nth-of-type(4)   [1440]**

   Tab stop 14, button "Replay sample captions": its focus change is faint: 1.27:1 against the ground, 3:1 needed

11. **moment-none      (the page)  [1440]**

   a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md)

12. **hero-screen      main#main > section.hero "A LITTLE HELP FOR EVERY MEETING Stay wit"  [1440]**

   the hero ends at 940px on a 900px screen, 40px below the fold: it ends at the fold, 1px either way (SR-1)

13. **section-height   footer.site-footer.wrap "buddy.Source · AGPL-3.0Privacy© 2026 Bud"  [1440]**

   the section is 88px tall (0.1 screens), 812px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)

14. **section-height (screen-short, screen-height) section#questions "A FEW THINGS WORTH ASKINGBefore yourfirs"  [1440, 390]**

   the section is 579px tall (0.6 screens), 321px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)

15. **section-height (screen-short, screen-height) section#privacy "03 / CHOOSE YOUR SETUPYour AI.On your te"  [1440, 390]**

   the section is 640px tall (0.7 screens), 260px short of one screen (900px): every section after the hero is one screen or two, 2px either way (and 1 more like it: "01 / THE WORKSPACEYour m") (SR-2)

16. **one-section      h2#questions-title "Before yourfirst meeting."  [1440]**

   the screen at scroll 1800px (stride 2) shows 314px of section 4 and the heading of section 4 whole and the content of 2 sections, over 24px each beside section 3: a screen shows one section (another may peek 8px, 24px WA

17. **one-section (neighbour) section#privacy "03 / CHOOSE YOUR SETUPYour AI.On your te"  [1440, 390]**

   the screen at scroll 2153px (the top of section 4) shows 233px of section 3 and the content of 3 sections, over 24px each beside section 4: a screen shows one section (another may peek 8px, 24px WARN) (and 2 more like it

18. **one-heading      h2#questions-title "Before yourfirst meeting."  [1440]**

   headings of two sections show whole on one screen at 6 of 44 scroll positions (13.6%; at scroll 1700, 1750, 1800, 1850px), here with "Your AI.On your terms.": at most 3% on a desktop (SR-5)

19. **container-edges  header.site-header.wrap "buddy. The workspaceYour setup GitHub★0D"  [1440]**

   the nav's content runs 160px from the left and 160px from the right (read from its outermost blocks: no .wrap): the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6)

20. **container-edges  main#main > section.hero "A LITTLE HELP FOR EVERY MEETING Stay wit"  [1440]**

   the content of section 1 runs 160px from the left and 160px from the right: the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (and 4 more like it: "01 / THE WORKSPACEYour m", "03 / CHOOSE YO

21. **container-edges  a.skip-link "Skip to content"  [1440]**

   a <a> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6)

22. **container-edges  div.demo-record-columns > div.demo-recorder > div:nth-of-type(1) > span:nth-of-type(2) "Tr  [1440]**

   1 text block starts on a left line at x 378, 218px from the container's left: text starts on the container's left, or on one split line (x 637, 732, 827) (SR-6)

23. **container-edges  div.demo-tour-body > div.demo-tour-main > div.demo-guide-top > p.eyebrow "MY MEETINGS / PR  [1440]**

   3 text blocks start on a left line at x 366, 206px from the container's left: text starts on the container's left, or on one split line (x 637, 732, 827) (also "YOUR MEETING SPACE", "Let’s test the new welcome flow ") (a

24. **container-edges  section#questions > div.faq-list "What exactly is Buddy?+A meeting workspa"  [1440]**

   a box over half the container wide runs 682-1280px, not on the container's lines at 160-1280px (SR-6)

25. **container-edges  div#voice-demo "LIVE TRANSCRIPTION / 45 SECONDSTry our s"  [1440]**

   a box over half the container wide runs 300-1140px, not on the container's lines at 160-1280px (SR-6)

26. **split-pair       section#privacy > div.wrap.setup-layout "03 / CHOOSE YOUR SETUPYour AI.On your te"  [1440]**

   the two columns of the split start 66px apart at the top (centred on each other): a split's columns are top-aligned, 8px either way (SR-8)

27. **split-pair       div#voice-demo "LIVE TRANSCRIPTION / 45 SECONDSTry our s"  [1440]**

   the split's columns are off the page's one pair of lines: its right column starts at x 693, on none of the split lines 637 (k=5), 732 (k=6), 827 (k=7) (SR-8)

28. **split-pair       div#workflow-screen > div.demo-record-columns "Transcript04:12Let’s test the new welcom"  [1440]**

   the split's columns are off the page's one pair of lines: its right column starts at x 863, the first split's at 693; its right column starts at x 863, on none of the split lines 637 (k=5), 732 (k=6), 827 (k=7) (SR-8)

29. **hero-fill        section#product "Your meeting. All the context."  [768]**

   the next section shows on the first screen: it starts at 908px on a 1024px screen (the hero ends at 908px)

30. **edge-left        section.hero p.eyebrow "LIVE TRANSCRIPTION / 45 SECONDS"  [1440]**

   starts at x 329; the lines are 160 and the column starts

31. **edge-left        section.hero p.voice-title "Try our state-of-the-artspeech-t"  [1440]**

   starts at x 329; the lines are 160 and the column starts

32. **edge-left        section.hero p.voice-permission "No audio or transcript is saved "  [1440]**

   starts at x 329; the lines are 160 and the column starts

33. **edge-left        section.hero p.voice-speakers  [1440]**

   starts at x 722.2; the lines are 160 and the column starts

34. **edge-left        #product p "Take a look around. Follow a con"  [1440]**

   starts at x 1035; the lines are 160 and the column starts

35. **edge-left        #product p.eyebrow "MY MEETINGS / PRODUCT CHECK-IN"  [1440]**

   starts at x 366; the lines are 160 and the column starts

36. **edge-left        #product p.eyebrow "YOUR MEETING SPACE"  [1440]**

   starts at x 366; the lines are 160 and the column starts

37. **edge-left        #product h3 "Product check-in"  [1440]**

   starts at x 366; the lines are 160 and the column starts

38. **edge-left        #product p.sample-caption "Let’s test the new welcome flow "  [1440]**

   starts at x 366; the lines are 160 and the column starts

39. **edge-left        #product p.eyebrow "YOUR NOTES"  [1440]**

   starts at x 888.9; the lines are 160 and the column starts

40. **edge-left        #product p "Keep the first release focused."  [1440]**

   starts at x 888.9; the lines are 160 and the column starts

41. **edge-left        #product p.demo-note-foot "The next step, kept in context."  [1440]**

   starts at x 888.9; the lines are 160 and the column starts

42. **edge-left        #privacy div.setup-card.app-frame "Buddy handles it Use locally for"  [1440]**

   starts at x 770; the lines are 160 and the column starts

43. **edge-left        #privacy h3 "Buddy handles it for you."  [1440]**

   starts at x 800; the lines are 160 and the column starts

44. **edge-left        #privacy p "Transcription and answers, with "  [1440]**

   starts at x 800; the lines are 160 and the column starts

45. **screen-short (screen-height) #product section.workflow.section-dark "01 / THE WORKSPACEYour meeting.A"  [1440, 390]**

   806px tall; one screen under the nav is 900px

46. **neighbour-ground #product section.workflow.section-dark "01 / THE WORKSPACEYour meeting.A"  [1440, 390]**

   framed, 94px of #privacy section.privacy-section "03 / CHOOSE YOUR SETUPYour AI.On"'s ground shows

47. **neighbour        #questions section.questions-section.wrap "A FEW THINGS WORTH ASKINGBefore "  [1440, 390]**

   framed, 88px of the footer shows

48. **hero-fold        section.hero section.hero "A LITTLE HELP FOR EVERY MEETING "  [1440, 390]**

   ends at y 940, past the fold (900): 1.04 screens tall

## Warnings

26 WARN (not blocking), first: same-action main#main > section.hero > div.hero-copy; copy-buttons header.site-header.wrap > div.header-act; copy-actions header.site-header.wrap > div.header-act; copy-actions (the page); centre-axis main#main > section.hero > div.hero-copy

See `WEBSITE_APP_DEMO.md` for component references, storage isolation and verification scope. Raw checker output remains an ignored local build artifact.
