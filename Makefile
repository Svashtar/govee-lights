UUID      := govee-lights@svashta.com
SRC       := src
BUILD     := build
DIST      := dist
INSTALL   := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
COMMIT    := $(shell git rev-parse --short HEAD 2>/dev/null)
JS_FILES  := $(shell find $(SRC) -name '*.js')
AI_NOTICE := Generated with AI for personal use.

.PHONY: all schemas install uninstall test lint pot pack ego-check clean nested

all: schemas

schemas: $(SRC)/schemas/gschemas.compiled

$(SRC)/schemas/gschemas.compiled: $(SRC)/schemas/*.gschema.xml
	glib-compile-schemas --strict $(SRC)/schemas

# Development install: a symlink, so edits are picked up on the next shell
# restart (log out and in on Wayland) or prefs reopen.
install: schemas
	mkdir -p $(dir $(INSTALL))
	rm -rf $(INSTALL)
	ln -s $(CURDIR)/$(SRC) $(INSTALL)
	@echo "Installed. Enable with: gnome-extensions enable $(UUID)"

uninstall:
	rm -rf $(INSTALL)

test:
	@set -e; for t in tests/*.test.js; do echo "== $$t"; gjs -m $$t; done

lint:
	npx --yes eslint@9 .

pot:
	xgettext --from-code=UTF-8 --language=JavaScript --keyword=_ --keyword=ngettext:1,2 \
		--package-name="Govee Lights" --output=po/govee-lights.pot $(JS_FILES)

# Builds dist/$(UUID).shell-extension.zip, the file uploaded to
# extensions.gnome.org and attached to GitHub releases.
pack: schemas
	rm -rf $(BUILD) && mkdir -p $(BUILD) $(DIST)
	cp -r $(SRC)/. $(BUILD)/
	rm -f $(BUILD)/schemas/gschemas.compiled
	cp CHANGELOG.md LICENSE $(BUILD)/
	@if [ -n "$(COMMIT)" ]; then \
		python3 -c 'import json,sys; p=sys.argv[1]; m=json.load(open(p)); m["commit"]=sys.argv[2]; json.dump(m,open(p,"w"),indent=2)' \
			$(BUILD)/metadata.json $(COMMIT); fi
	gnome-extensions pack $(BUILD) --force --out-dir=$(DIST) \
		--extra-source=lib --extra-source=ui --extra-source=prefs --extra-source=icons \
		--extra-source=CHANGELOG.md --extra-source=LICENSE --podir=../po
	@echo "Built $(DIST)/$(UUID).shell-extension.zip"
	@if grep -rqF "$(AI_NOTICE)" $(SRC); then \
		echo "Note: source files still carry the AI notice; see 'make ego-check' before uploading to EGO."; fi

# Run before uploading to extensions.gnome.org. Fails while any source file
# still carries the AI notice: the maintainer removes it by hand after
# reviewing the code (https://gjs.guide/extensions/review-guidelines/best-practices.html).
ego-check: test lint pack
	@files=$$(grep -rlF "$(AI_NOTICE)" $(SRC)); \
	if [ -n "$$files" ]; then echo "AI notice still present in:"; echo "$$files"; exit 1; fi
	@if unzip -l $(DIST)/$(UUID).shell-extension.zip | grep -qE 'gschemas.compiled|\.po$$|\.pot$$'; then \
		echo "Zip contains compiled schemas or .po files"; exit 1; fi
	@echo "Ready to upload $(DIST)/$(UUID).shell-extension.zip"

# Nested GNOME Shell for testing without logging out (needs mutter-devkit).
nested: install
	dbus-run-session gnome-shell --devkit --wayland

clean:
	rm -rf $(BUILD) $(DIST) $(SRC)/schemas/gschemas.compiled
