SYSTEMD_DIR = $(HOME)/.config/systemd/user
SERVICES = opencode-server.service
SKILLS = remember recall

.PHONY: install uninstall lint typecheck check install-skills install-plugin

OPENCODE_WORKSPACE ?= $(shell grep '^OPENCODE_WORKSPACE=' .env 2>/dev/null | cut -d= -f2)
SERVER_WORKDIR = $(if $(OPENCODE_WORKSPACE),$(OPENCODE_WORKSPACE),$(CURDIR))

install: install-plugin install-skills
	mkdir -p $(SYSTEMD_DIR)
	sed 's|{{WORKDIR}}|$(SERVER_WORKDIR)|g' opencode-server.service > $(SYSTEMD_DIR)/opencode-server.service
	systemctl --user daemon-reload

install-plugin:
	mkdir -p $(SERVER_WORKDIR)/.opencode/plugins
	ln -sf $(CURDIR)/src/main.ts $(SERVER_WORKDIR)/.opencode/plugins/clawcode.ts

install-skills:
	@for skill in $(SKILLS); do \
		mkdir -p $(SERVER_WORKDIR)/.opencode/skills/$$skill; \
		cp skills/$$skill/SKILL.md $(SERVER_WORKDIR)/.opencode/skills/$$skill/SKILL.md; \
	done
	@echo "Skills installed to $(SERVER_WORKDIR)/.opencode/skills/"

uninstall:
	systemctl --user disable --now $(SERVICES) 2>/dev/null || true
	rm -f $(addprefix $(SYSTEMD_DIR)/,$(SERVICES))
	rm -f $(SERVER_WORKDIR)/.opencode/plugins/clawcode.ts
	systemctl --user daemon-reload

lint:
	bun run lint

typecheck:
	bun run typecheck

check: lint typecheck
