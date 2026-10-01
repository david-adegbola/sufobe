# Metsäni review packet

Everything a reviewer needs before Metsäni is played in classrooms. Each section names who should review it and what to check. Tick a box when it is done, and write the source or the change next to it.

The model and every number in it are described in `forest-model.md`. Lines marked **verify** there are the ones that matter most.

## 1. Forest scientist (UEF or Luke): the model

Read `forest-model.md` first (about 15 minutes). Then:

- [ ] **Growth.**
  - Do 80-year volumes, heights and stem numbers fall in believable ranges for Finnish sites? See "Calibration ranges in the tests".
  - Which Luke growth and yield tables should we calibrate against?
  - Run `npm run forest` in `game/` to print 80–100-year runs for any species, soil and place, e.g. `npm run forest -- spruce sandy east 100`.
- [ ] **Directions a child will discover:**
  - spruce grows much better on loam than on sand
  - pine copes with sand
  - south grows more than east, and east more than Lapland
  - birch is the fast starter
  - spruce tolerates shade
  - drought hurts spruce more than pine
  - thinning makes the remaining trees grow thicker

  Are all of these right, and is anything important missing?
- [ ] **Known issue.** A short pulpwood rotation (clear-cut at about 35 years) gives about 10 % more total volume than a thinned rotation. Is that plausible, or is thinning under-rewarded? (`forest-model.md`, "Trade-offs")
- [ ] **Disturbances.** Check the storm frequency and species and soil factors, the bark-beetle risk rules, and the moose browsing rates.
- [ ] **Soil carbon.** Check the starting soil carbon by soil type (peat 600 t C/ha), decay rates, ground-plant litter, and that a young stand is a small carbon source for its first years.
- [ ] **Thinning and harvest rules.** Check when Tikka suggests thinning (relative density ≥ 0.65, dominant height ≥ 11 m, mean diameter ≥ 12 cm, 15 years since the last cut), how much is left (19 or 23 m²/ha), and when a stand counts as mature.
- [ ] **Wood flows.** Check the sawlog sizes, the sawmill split (sawn 0.47 / chips 0.33 / energy 0.20), the pulp mill split (paper 0.45 / textile 0.05 / energy 0.50), and that pulp mills burn their own residues for energy.
- [ ] **Products.**
  - Half-lives: sawn wood 35 years and paper 2 years are IPCC 2019 defaults; textile 3 years is our guess.
  - Recycling: a 60 % recovery share and at most 6 rounds.
  - Carbon per item (table 8 kg, beam 25 kg, notebook 0.04 kg, box 0.13 kg, shirt 0.09 kg, one evening of sauna firewood 5 kg).
- [ ] **Forest Act line.** After a final harvest, Tikka says the Forest Act requires a new forest to be grown. Is the wording right?
- [ ] **Neutrality.** Clear-cutting and continuous cover are offered as equal choices with honest trade-offs. Does the game take a side anywhere?

## 2. Primary teacher (grades 4–6): words and the lesson

- [ ] **Language.** Play 30 minutes in Finnish. Are the words right for 10–12-year-olds? Do Tikka's questions and the year reports make sense? Are any terms too hard (harvennus, taimikonhoito, säästöpuu, jatkuva kasvatus)?
- [ ] **Lesson plan.** Does the 45-minute plan in the teacher's guide (`metsani-teacher-guide.md`) work in a real lesson? What would you cut?
- [ ] **Class question.** Are the four multiple-choice questions fair, clear and unambiguous? Should any be changed?
- [ ] **Curriculum.** Which parts of the curriculum (environmental studies, grades 3–6) does this support? We have deliberately not written objective codes; please add them if useful.
- [ ] **Accessibility in class.** Can a child who uses a keyboard, or a screen reader, play? The forest has a spoken description, trees can be chosen with the arrow keys, and every screen works with Tab and Escape.

## 3. Forest ecologist: life and animals

- [ ] **Life result.** Life (0–5) is made of:
  - species mix, once trees are over about 12 m
  - broadleaves
  - visible dead trees (up to 1.5 points at 40 m³/ha)
  - big old trees

  Are these the right ingredients and weights for a 10–12-year-old's picture of forest biodiversity?
- [ ] **Animal rules.** Check each rule in `forest-model.md`, "Animals". In particular:
  - the black woodpecker: 2 trees ≥ 30 cm and ≥ 10 m³/ha of dead trees
  - the flying squirrel: an aspen ≥ 20 cm and 5 spruces ≥ 20 cm
  - the capercaillie
- [ ] **Retention trees.** We keep 2 trees per 20 × 20 m plot (50 per hectare) so they are visible; real practice is usually 5–10 per hectare. Is that acceptable if the guide says so?

## 4. Classroom playtest (after sections 1–3)

**Who:** one class of 10–12-year-olds, each on their own device if possible. Ask the school how guardians should be informed. The game collects no personal data, but a playtest is still research.

**Before:** in each device's *Tietoa / About* screen, switch on *Luokan kysely / Class question*.

**During the lesson:**
1. Each child plants a forest. The four questions appear first.
2. The children play for about 30 minutes, following the guide's lesson plan.
3. When a forest reaches 30 years, the same four questions appear again.

**What to watch** (write down observations, never names):
- Can the child tell, after 30 years, which soil or which choice grew the better forest, and why?
- Do they use "What if?" without being told?
- Do they read Tikka's questions, or click through?
- Where do they get stuck or bored?
- Can they trace one product back to a tree and say what happened to it on the way?

**After:**
- Read each device's results in *About* and copy the percentages onto paper.
- Clear the results.
- If children used shared devices, the same tally covers several children. Read it before each new group and clear it in between.

**Success criteria (suggested):** after the lesson, most children can:
- say where a tree's carbon comes from
- name one trade-off between cutting and leaving a forest
- trace one product back to its tree

## 5. Privacy and publishing (the person publishing the game)

- [x] Fill in the operator name and contact (`game/src/app/legal.ts`, `OPERATOR`).
- [x] Name the host where the game will be published (`legal.ts`, the "Third parties" paragraph): GitHub Pages.
- [ ] Optionally, state the governing law for the terms.
- [ ] Re-read `docs/LEGAL.md`. Have someone qualified check the reasoning before use in schools.
- [ ] On a real iPad and an Android tablet, open the offline web build (`npm run build`, see the README's *Publish*), play two seasons, install it, switch on flight mode, and check that it still opens and plays.
- [ ] Move progress from one device to the other with the QR code, and restore a backup file.

The browser storage keys used by Metsäni are listed in `docs/LEGAL.md`:
- `kasva-forest`: the forest and its products
- `kasva-quiz-on` and `kasva-quiz`: the class question switch and answer counts

All of them are removed by *Delete all data*.
