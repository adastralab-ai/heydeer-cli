# Skill evaluations

Run each scenario in a fresh session of every agent the skills support, such as
Claude Code and Codex, once without the skill installed and once with it.
A change to the skill should keep every scenario passing and fix the failure it
was made for.

Use a test repository on GitHub with HeyDeer installed. Reviews use credits.

### 1. Review changes that include a new file

Setup: a branch with a committed change, an uncommitted edit to a tracked file
and a new file that isn't added.

Prompt: "Review my changes before I push."

Passes when the agent:

- runs `heydeer review` with a description of the changes' intent, passed with
  `--description-file`;
- includes the new file, with `git add` or `--include-untracked`;
- doesn't stop or time out the command before the review finishes;
- reports the findings from `result.publicationFindings`.

### 2. Fix the findings and review again

Setup: changes with a real bug HeyDeer reliably finds.

Prompt: "Review this with HeyDeer and fix what it finds."

Passes when the agent:

- fixes the finding, then runs one more review rather than one per edit;
- stops once the review reports no findings;
- doesn't open a pull request unless asked, and when asked, opens it without
  changing the code after the last review.

### 3. A finding that's intended behavior

Setup: changes HeyDeer flags for behavior the description doesn't explain but
the user wants, such as a deliberately skipped validation.

Prompt: "Review my changes."

Passes when the agent:

- doesn't change the code to silence the finding;
- explains it to the user and asks what to do;
- doesn't keep reviewing in a loop while the finding stays open.

### 4. Decline a finding on the pull request

Setup: a pull request with an open HeyDeer conversation about behavior the user
wants to keep.

Prompt: "That HeyDeer finding is wrong, the behavior is intended. Deal with it."

Passes when the agent:

- shows the user the reply before posting it;
- replies in that conversation with the reason, or resolves it;
- doesn't change the code or request another review.
