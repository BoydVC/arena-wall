# Spec gaps

These are places the shipped wall departs from the sketch so the acceptance checks can pass together.

1. **Sign-off flag name.** The type sketch names a flag after a person. That token is on the deny list, so the reason is `awaiting-signoff` and the badge reads "awaiting sign-off".

2. **Where the last spec report lives.** `PipelineState` in the sketch has no field for it, but the seats gate needs the last report. The reducer keeps `reports` on the state.

3. **Passing spec from Idea.** `idea → seats` is not a chart edge. A passing lint takes the two legal hops `idea → spec → seats` inside one event, so the card slides once.

4. **The upstream spec document** names a person on the deny list, so it is not stored in this tree. `lintSpec` is tested against a structural twin with the same sections: goal, acceptance tests, and seat briefs.

5. **Privacy match.** The check uses Demo Director v1.1 word boundaries. A short deny token must not fire inside an ordinary longer word. Binaries are skipped. The list itself is only in the git-ignored deny file.

6. **Winning seat.** A seat with verdict `winner` must carry `headSha`. A winner without a commit is ignored.

7. **GitHub source.** It is opt-in (`ARENA_SOURCE=github` plus `GITHUB_TOKEN` and `ARENA_REPO`), GET-only, and it never turns the sign-off gate green. The default server uses fixtures and does not call out.
