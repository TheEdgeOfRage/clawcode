SYSTEMD_DIR = $(HOME)/.config/systemd/user
SERVICES = opencode-server.service clawcode-bridge.service

.PHONY: install uninstall lint typecheck check

OPENCODE_WORKSPACE ?= $(shell grep '^OPENCODE_WORKSPACE=' .env 2>/dev/null | cut -d= -f2)
SERVER_WORKDIR = $(if $(OPENCODE_WORKSPACE),$(OPENCODE_WORKSPACE),$(CURDIR))

install:
	mkdir -p $(SYSTEMD_DIR)
	sed 's|{{WORKDIR}}|$(SERVER_WORKDIR)|g' opencode-server.service > $(SYSTEMD_DIR)/opencode-server.service
	sed 's|{{WORKDIR}}|$(CURDIR)|g' clawcode-bridge.service > $(SYSTEMD_DIR)/clawcode-bridge.service
	systemctl --user daemon-reload

uninstall:
	systemctl --user disable --now $(SERVICES) 2>/dev/null || true
	rm -f $(addprefix $(SYSTEMD_DIR)/,$(SERVICES))
	systemctl --user daemon-reload

lint:
	bun run lint

typecheck:
	bun run typecheck

check: lint typecheck
