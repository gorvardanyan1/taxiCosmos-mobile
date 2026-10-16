# Sourced by the other scripts: makes `java` and `maestro` available when they were installed per user in ~/.local
# (no admin rights) and the shell did not load ~/.bashrc, e.g. CI helpers and non-interactive shells.
if ! command -v java >/dev/null 2>&1 && [ -x "$HOME/.local/share/jdk/current/bin/java" ]; then
  export JAVA_HOME="$HOME/.local/share/jdk/current"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
if ! command -v maestro >/dev/null 2>&1 && [ -x "$HOME/.local/bin/maestro" ]; then
  export PATH="$HOME/.local/bin:$PATH"
fi
export MAESTRO_CLI_NO_ANALYTICS=1

if ! command -v maestro >/dev/null 2>&1; then
  echo "maestro not found: install Java 17+ and the Maestro CLI (docs/testing.md)." >&2
  exit 127
fi
