## 2026-06-08 — Answer correction feature
- Added GROQ_API_KEY as Cloudflare Worker secret
- Added POST /correct route to worker (Groq Llama 3.3 70B, json_object response format)
- Moved /health route before auth block so it's always publicly reachable (worker v2.1.0)
- Extended renderQuestions() in Renderer to add answer textareas and Check answers button
- Added checkAnswers() to Correction section
- Added currentContext and currentQuestions to State
- Added correction CSS to index.html
- Fixed index.html to load app.js via <script src="app.js"> instead of inline script

## 2026-06-09 - Exercise Flow — MCQ + Comprehension + Discussion stages

### What was built

**Multiple choice question (MCQ) stage**
- All 3 prompt builders (news, reads, external) now include `multiple_choice[4]` with `{question, options[4], correct}` where `correct` is the full text of the correct option, not an index.
- New State variables: `currentExerciseStage`, `currentMCQIndex`, `mcqResults[4]`, `currentMCQs[]`, `currentDiscussion[]`.
- MCQ renders one question at a time with ‹ back, › next, and ›› skip-to-comprehension navigation.
- Options shuffled deterministically per question index (seeded shuffle) — same order always restored on back navigation.
- Correct answer identified by text match, not index, so shuffling never breaks it.
- Old articles (no `multiple_choice` field) skip directly to comprehension stage.

**Comprehension stage**
- Full-width single column (right column hidden until discussion stage is built).
- Four questions with answer textareas.
- "Check answers" button (submits all 4 to Groq /correct route, displays inline feedback).
- "Discussion →" button always visible from the start — skips straight to discussion stage without requiring answers first.

**Discussion stage**
- Placeholder only: shows the 4 discussion questions + "Graded discussion responses coming soon." notice.
- Right column restored when this stage is reached (questions visible).

**Column visibility logic**
- MCQ stage: single column, right column hidden.
- Comprehension stage: single column, right column hidden.
- Discussion stage: both columns shown (discussion questions in right column — future grading UI in left).

### Key State additions (app.js Section 2)
- `currentMCQs[]` — full multiple_choice array for the current article
- `currentDiscussion[]` — discussion questions for the current article
- Both set in `renderArticle()` and `renderExternalText()`

### Files changed
- `app.js` — Sections 2 (State), 4 (Generator prompts), 5 (Renderer), 7 (Correction)
- No worker changes this session
- No index.html changes this session (CSS for MCQ classes was added in a prior session)

### What's next
1. Graded discussion responses — qualitative labels (insightful/lazy/etc) + grammar feedback via Groq; needs /correct route extension + new UI
2. Dual correction — grammar + content per comprehension answer
3. Grammar section — from Felipe's Portuguese teaching materials, adapted per language using CEFR
4. Content seeding — manual JSONL batches, import script, target ~50 articles
