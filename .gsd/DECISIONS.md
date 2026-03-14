# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001 | arch | Provider abstraction | IssueProvider interface with GitLab/GitHub implementations | Both providers used daily, need first-class support for both | No |
| D002 | M001 | arch | Provider auto-detection | Detect from git remote URL (gitlab.com → GitLab, github.com → GitHub) | Matches predecessor pattern, zero-config for common case | Yes — if self-hosted instances need custom detection |
| D003 | M001 | convention | Config file | Unified .gsd/issues.json with provider-specific sections | User confirmed — one config file, not separate per-provider | No |
| D004 | M001 | convention | Mapping file format | ISSUE-MAP.json (clean break from GITLAB-MAP.json) | User confirmed new format only, no backward compat | No |
| D005 | M001 | arch | Import workflow design | Extension fetches/formats, LLM interprets via sendUserMessage | Import is inherently fuzzy/creative work — LLM judgment, not deterministic pipeline | No |
| D006 | M001 | arch | Sync trigger model | Prompted step in GSD flow (not manual-only, not auto) | User correction: should be part of the flow but with explicit confirmation before creating remote issues | No |
| D007 | M001 | arch | Lifecycle hook for close | Watch tool_result for S##-SUMMARY.md writes | More precise than watching agent_end — triggers on exact file write signaling completion | Yes — if a dedicated slice completion event is added to GSD core |
| D008 | M001 | arch | Event bus usage | Emit gsd-issues:* events on pi.events for composability | Cheap to add, enables future extension interop | No |
| D009 | M001 | scope | GitLab extras | Full support: epics, weight (S/M/L), T::Done labels, reorg | User confirmed — these are actively used, not optional metadata | No |
| D010 | M001 | scope | npm distribution | Core requirement, not deferred | User confirmed — must be installable and updatable | No |
| D011 | M001/S01 | scope | Defer state helpers to S03 | `readGSDState()` and `parseRoadmapSlices()` built in S03 when sync needs them, not S01 | These are simple file-reading utilities only consumed by sync — building them without a consumer to test against adds dead code to S01 | Yes — pull into S01 if S03 planning reveals a need |
| D012 | M001/S01 | arch | Injected exec function for testability | Providers take an `ExecFn` parameter instead of importing `pi.exec()` directly | Enables mock-based testing without real CLIs, and decouples library code from pi runtime | No |
| D013 | M001/S01 | convention | Provider state normalization | GitLab `opened` → `open`, GitHub `OPEN`/`CLOSED` → lowercase | Downstream code always sees consistent lowercase `open`/`closed` regardless of provider | No |
| D014 | M001/S01 | convention | Structural validation over schema libraries | IssueMapEntry validation checks field names and types directly, no runtime schema dep | Zero runtime dependencies in the library layer — validation is explicit and debuggable | Yes — if a schema library is introduced for config validation in S02 |
