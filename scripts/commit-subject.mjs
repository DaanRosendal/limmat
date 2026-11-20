// The commit subject rule from AGENTS.md: Conventional Commits, `type(scope)!: description`.
export const TYPES = ['feat', 'fix', 'test', 'docs', 'refactor', 'chore', 'perf', 'ci', 'build', 'style', 'revert'];
const RE = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9._/-]+\\))?!?: \\S`);

/** Is this subject line acceptable? Merge commits are not written by hand, so they pass. */
export const isConventional = (subject) => RE.test(subject) || /^Merge /.test(subject);
