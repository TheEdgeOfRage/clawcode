SYSTEMD_DIR = $(HOME)/.config/systemd/user
SERVICES = opencode-server.service clawcode-bridge.service

.PHONY: install uninstall lint typecheck check

install:
	mkdir -p $(SYSTEMD_DIR)
	cp $(SERVICES) $(SYSTEMD_DIR)/
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
