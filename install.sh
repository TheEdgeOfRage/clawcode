#!/usr/bin/env bash
set -euo pipefail

SYSTEMD_DIR="$HOME/.config/systemd/user"
SERVICE=opencode-server.service

[[ -f .env ]] && source .env
OPENCODE_WORKSPACE="${OPENCODE_WORKSPACE:-$HOME/workspace}"

usage() {
	echo "Usage: $0 {install|uninstall}" >&2
	exit 1
}

do_install() {
	cp -r .opencode/. "$OPENCODE_WORKSPACE/.opencode/"

	mkdir -p "$OPENCODE_WORKSPACE/.opencode/plugins"
	ln -sf "$PWD/src/main.ts" "$OPENCODE_WORKSPACE/.opencode/plugins/clawcode.ts"

	mkdir -p "$SYSTEMD_DIR"
	sed "s|{{WORKDIR}}|$OPENCODE_WORKSPACE|g" "$SERVICE" > "$SYSTEMD_DIR/$SERVICE"
	systemctl --user daemon-reload
	echo "installed"
}

do_uninstall() {
	systemctl --user disable --now "$SERVICE" 2>/dev/null || true
	rm -f "$SYSTEMD_DIR/$SERVICE"
	rm -f "$OPENCODE_WORKSPACE/.opencode/plugins/clawcode.ts"
	systemctl --user daemon-reload
	echo "uninstalled"
}

case "${1:-}" in
	install)   do_install ;;
	uninstall) do_uninstall ;;
	*)         usage ;;
esac
