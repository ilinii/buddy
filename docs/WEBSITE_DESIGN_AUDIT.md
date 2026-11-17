# Website design audit

GATE: OPEN 39 (rounds used up), 17 November 2026. The requested FAQ/download/stars edits passed functional responsive checks. Remaining findings are stylistic and include full-screen section heights/alignment conventions that differ from the requested compact page. No full design-gate pass is claimed.

## Specific exceptions

- copy-headline: The user explicitly retains the Stay with the conversation headline from their screenshot; the adjacent lead names meeting notes and context.

- motion-layer: This established site uses original CSS motion rather than the kit stylesheet: .button:hover moves by -2px, press scales, link underlines animate and tabs transition. These rules are present and observed; no licensed kit code was copied.

- hero-enter: The hero has data-enter and runs the original hero-enter keyframes for opacity, translation and blur; reduced motion disables it. Requiring the kit-specific html.m-enter class would misreport this functioning entrance.

## Open findings

1. **text-only** — section#questions "Before your first meeting."

   the closing section is only text: no picture, icon, mock or effect in it

   Suggested by checker: give the section a visual: a photograph that fits, the real icons, or a UI fragment on a ground

2. **cta** — section#questions "Before your first meeting."

   the last section before the footer ends with no button

   Suggested by checker: add the action: a button in the hero, one on every priced item, one in the closing section

3. **heading-scale** — h2#workflow-title "Your meeting. All the context."

   h2 headings in 2 sizes, 38px ("Before your first meetin") to 60px (x1.58)

   Suggested by checker: size headings by level: the h1 largest, one size per level, each level below the one above

4. **moment-none** — (the page)

   a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md)

   Suggested by checker: deal one (moments.mjs pick --page software) and mount it in its own section

5. **hero-screen** — main#main > section.hero "A LITTLE HELP FOR EVERY MEETING Stay wit"

   the hero ends at 913px on a 900px screen, 13px below the fold: it ends at the fold, 1px either way (SR-1)

   Suggested by checker: make the hero exactly one screen (height: 100svh, its content fitted inside), never taller or shorter

6. **section-height** — footer.site-footer.wrap "buddy.Source · AGPL-3.0Privacy© 2026 Bud"

   the section is 88px tall (0.1 screens), 812px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)

   Suggested by checker: set the section to one screen or two (height: calc(var(--h,1) * 100vh), --h 1 or 2) and cut or split its content to fit

7. **section-height** — section#questions "A FEW THINGS WORTH ASKINGBefore yourfirs"

   the section is 579px tall (0.6 screens), 321px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)

   Suggested by checker: set the section to one screen or two (height: calc(var(--h,1) * 100vh), --h 1 or 2) and cut or split its content to fit

8. **section-height** — section#privacy "03 / CHOOSE YOUR SETUPYour AI.On your te"

   the section is 640px tall (0.7 screens), 260px short of one screen (900px): every section after the hero is one screen or two, 2px either way (and 1 more like it: "01 / THE WORKSPACEYour m") (SR-2)

   Suggested by checker: set the section to one screen or two (height: calc(var(--h,1) * 100vh), --h 1 or 2) and cut or split its content to fit

9. **one-section** — h2#questions-title "Before yourfirst meeting."

   the screen at scroll 1800px (stride 2) shows 427px of section 4 and the heading of section 4 whole and the content of 2 sections, over 24px each beside section 3: a screen shows one section (another may peek 8px, 24px WARN) (SR-4)

   Suggested by checker: make each section exactly one screen or two, so a screen shows one section and no neighbour peeks

10. **one-section** — section#privacy "03 / CHOOSE YOUR SETUPYour AI.On your te"

   the screen at scroll 2040px (the top of section 4) shows 233px of section 3 and the content of 3 sections, over 24px each beside section 4: a screen shows one section (another may peek 8px, 24px WARN) (and 2 more like it: scroll 913px, scroll 900px) (SR-4)

   Suggested by checker: make each section exactly one screen or two, so a screen shows one section and no neighbour peeks

11. **one-heading** — h2#privacy-title "Your AI.On your terms."

   headings of two sections show whole on one screen at 8 of 41 scroll positions (19.5%; at scroll 1100, 1150, 1600, 1650px), here with "Your meeting.All the context.": at most 3% on a desktop (SR-5)

   Suggested by checker: make the sections one screen tall so their headings sit a screen apart and two never share one

12. **container-edges** — header.site-header.wrap "buddy. The workspaceYour setup GitHub★0D"

   the nav's content runs 160px from the left and 160px from the right (read from its outermost blocks: no .wrap): the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6)

   Suggested by checker: use one container on every section and the nav (.wrap): one margin left and right, 64-120px on a desktop, 16-24px on a phone

13. **container-edges** — main#main > section.hero "A LITTLE HELP FOR EVERY MEETING Stay wit"

   the content of section 1 runs 160px from the left and 160px from the right: the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (and 4 more like it: "01 / THE WORKSPACEYour m", "03 / CHOOSE YOUR SETUPYo", "A FEW THINGS WORTH ASKIN") (SR-6)

   Suggested by checker: use one container on every section and the nav (.wrap): one margin left and right, 64-120px on a desktop, 16-24px on a phone

14. **container-edges** — a.skip-link "Skip to content"

   a <a> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6)

   Suggested by checker: build the page as header.nav, a main of sections (each one in-flow .wrap plus background layers) and footer.closing

15. **container-edges** — div#workflow-screen > p.eyebrow "YOUR MEETING SPACE"

   4 text blocks start on a left line at x 711, 551px from the container's left: text starts on the container's left, or on one split line (x 637, 732, 827) (also "Product check-in", "Today · 10:30", "Your own notes stay alongside th") (SR-6)

   Suggested by checker: start the text on the container's left, or on the one split line every split shares

16. **container-edges** — div#voice-demo > div.voice-intro > p.eyebrow "LIVE TRANSCRIPTION / 45 SECONDS"

   3 text blocks start on a left line at x 329, 169px from the container's left: text starts on the container's left, or on one split line (x 637, 732, 827) (also "Try our state-of-the-artspeech-t", "No audio or transcript is saved ") (SR-6)

   Suggested by checker: start the text on the container's left, or on the one split line every split shares

17. **container-edges** — section#questions > div.faq-list "What exactly is Buddy?+A meeting workspa"

   a box over half the container wide runs 682-1280px, not on the container's lines at 160-1280px (SR-6)

   Suggested by checker: run the picture or box from the container's left line to its right line, or put it in a row or a split

18. **container-edges** — div#voice-demo "LIVE TRANSCRIPTION / 45 SECONDSTry our s"

   a box over half the container wide runs 300-1140px, not on the container's lines at 160-1280px (SR-6)

   Suggested by checker: run the picture or box from the container's left line to its right line, or put it in a row or a split

19. **split-pair** — section#product > div.wrap.workspace-layout "01 / THE WORKSPACEYour meeting.All the c"

   the two columns of the split start 118px apart at the top: a split's columns are top-aligned, 8px either way (SR-8)

   Suggested by checker: top-align both columns of the split (align-items: start)

20. **split-pair** — section#privacy > div.wrap.setup-layout "03 / CHOOSE YOUR SETUPYour AI.On your te"

   the two columns of the split start 66px apart at the top (centred on each other): a split's columns are top-aligned, 8px either way (SR-8)

   Suggested by checker: top-align both columns of the split (align-items: start)

21. **split-pair** — div#voice-demo "LIVE TRANSCRIPTION / 45 SECONDSTry our s"

   the split's columns are off the page's one pair of lines: its right column starts at x 693, on none of the split lines 637 (k=5), 732 (k=6), 827 (k=7) (SR-8)

   Suggested by checker: start every split's right column on one shared line (wrap.left + k x (width + 24) / 12, k 5, 6 or 7; 6 on a place page) and end the left one 24px before it

22. **hero-fill** — section#product "Your meeting. All the context."

   the next section shows on the first screen: it starts at 900px on a 1024px screen (the hero ends at 900px)

   Suggested by checker: let the hero fill the first screen alone (min-height: 100svh, less above it): nothing of the next section on load

23. **edge-left** — section.hero p.eyebrow "LIVE TRANSCRIPTION / 45 SECONDS"

   starts at x 329; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

24. **edge-left** — section.hero p.voice-title "Try our state-of-the-artspeech-t"

   starts at x 329; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

25. **edge-left** — section.hero p.voice-permission "No audio or transcript is saved "

   starts at x 329; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

26. **edge-left** — section.hero p.voice-speakers

   starts at x 722.2; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

27. **edge-left** — #product div.workspace-tour "Record Ask your context buddy.IL"

   starts at x 682; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

28. **edge-left** — #product p.eyebrow "YOUR MEETING SPACE"

   starts at x 711; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

29. **edge-left** — #product h3 "Product check-in"

   starts at x 711; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

30. **edge-left** — #product p "“Let’s test the new welcome flow"

   starts at x 711; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

31. **edge-left** — #product p.demo-personal-note "Your own notes stay alongside th"

   starts at x 711; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

32. **edge-left** — #privacy div.setup-card.app-frame "Buddy handles it Use locally for"

   starts at x 770; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

33. **edge-left** — #privacy h3 "Buddy handles it for you."

   starts at x 800; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

34. **edge-left** — #privacy p "Transcription and answers, with "

   starts at x 800; the lines are 160 and the column starts

   Suggested by checker: start it on the .wrap left line

35. **screen-short** — #product section.workflow.section-dark "01 / THE WORKSPACEYour meeting.A"

   720px tall; one screen under the nav is 900px

   Suggested by checker: make the section one full screen (--h: 1, layout-v4.md section 2)

36. **neighbour** — #product section.workflow.section-dark "01 / THE WORKSPACEYour meeting.A"

   framed, 21px of #privacy section.privacy-section "03 / CHOOSE YOUR SETUPYour AI.On" shows

   Suggested by checker: keep the next section's heading and picture out of this screen

37. **neighbour** — #questions section.questions-section.wrap "A FEW THINGS WORTH ASKINGBefore "

   framed, 88px of the footer shows

   Suggested by checker: keep the next section's heading and picture out of this screen

38. **hero-fold** — section.hero section.hero "A LITTLE HELP FOR EVERY MEETING "

   ends at y 913, past the fold (900): 1.01 screens tall

   Suggested by checker: the hero fills the first screen alone, its button inside it

39. **neighbour-ground** — #product section.workflow.section-dark "01 / THE WORKSPACEYour meeting.A"

   framed, 10px of #privacy section.privacy-section "03 / CHOOSE YOUR SETUPYour AI.On"'s ground shows

   Suggested by checker: end the ground with the section
