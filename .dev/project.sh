# .dev/project.sh — squaring: semantic control plane for agent-built software.
# Library + CLI + MCP server: no runtime servers, no ports per worktree.

# Required: git repo URL (builders branch from origin/main and PR back here).
PROJECT_REPO="git@github.com:typicalday/squaring.git"

# Worktree layout — cut branches with `dev create squaring <branch>`.
PROJECT_LAYOUT="worktree"

# tmux windows — name:command (empty command = shell).
PROJECT_WINDOWS=(
  "claude:claude --dangerously-skip-permissions"
  "cli:"
)

# No runtime ports; registered block exists only for worktree bookkeeping.
PROJECT_PORTS=()

# No .dist templates.
PROJECT_DIST_FILES=()
