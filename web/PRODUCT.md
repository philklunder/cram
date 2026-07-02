# Product

## Register

product

## Users

A focused solo learner (student) preparing for real exams. They arrive mid-task: they have
subjects with exam dates, AI-generated flashcard decks and quizzes, spaced-repetition reviews to
clear, and real-world grades to log. Context is a study session — they want to see what is due,
what is weak, and get straight into reviewing. The web app ("the study desk") is the desktop/
browser counterpart to the iOS app; both sync through the same Cram backend.

## Product Purpose

Cram turns uploaded course material into flashcards and quizzes, schedules them with SM-2 spaced
repetition, and paces study toward each subject's exam using the learner's real grades. The web
dashboard lets them browse subjects, run reviews and quizzes in the browser, track mastery
progress, and record grades. Success = the learner can tell at a glance which subject needs
attention today, and start working on it in one click.

## Brand Personality

Encouraging, focused, quietly confident. A capable study companion, not a gamified toy and not a
grey enterprise tool. Voice is plain and warm ("cards due for review", not "0 items in queue").
Color and motion should make progress feel alive and rewarding without getting in the way of the
task.

## Anti-references

- Grey enterprise dashboards (dense, joyless, all-neutral).
- Childish/gamified edtech (mascots, confetti spam, cartoon badges).
- AI-slop tells: gradient text, decorative glassmorphism everywhere, tiny uppercase eyebrows on
  every section, side-stripe accent borders, hero-metric templates.

## Design Principles

1. **Every subject has an identity.** A subject wears one consistent accent color everywhere it
   appears, so the learner navigates by color as much as by name.
2. **Urgency is honest.** Exam proximity and cards-due drive semantic color (red/amber/green) —
   never decoration. The subject accent and the urgency signal stay visually distinct.
3. **Motion conveys state.** Entrances, count-ups, progress fills, and tab transitions reflect
   real change (loaded, mastered, switched). No motion for show; all of it respects reduced-motion.
4. **The tool disappears into the task.** Earned familiarity over novelty — standard tabs, standard
   controls, one click from "what's due" to "reviewing it".

## Accessibility & Inclusion

WCAG AA is the floor: body text ≥ 4.5:1, large text ≥ 3:1; every per-subject `ink` tone is
contrast-checked on both white and its own tint. Full keyboard focus-visible rings on all
interactive elements. All motion has a `prefers-reduced-motion` path (crossfade / instant). Light
theme is locked app-wide (no per-section inversion).
