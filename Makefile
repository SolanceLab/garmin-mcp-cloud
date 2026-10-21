# `make test` runs every check in this room. There are no unit tests yet (the room talks to live Garmin),
# so this type-checks every source file.
.PHONY: test
test:
	npm install --no-audit --no-fund
	npx tsc --noEmit
	npx vitest run
