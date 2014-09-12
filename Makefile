all: build acl

build:
	util/catjs src/collector.js src/web_smoothness.js > bin/web_smoothness.js
	util/catjs src/collector.js src/fps_meter_element.js > bin/fps_meter_element.js

acl:
	find . -name \*.html -exec chmod 664 {} \;
	find . -name \*.css -exec chmod 664 {} \;
	find . -name \*.js -exec chmod 664 {} \;
	find . -name \*.png -exec chmod 664 {} \;
	find . -not -path '*/\.*' -type d -exec chmod 755 {} \;

.PHONY: all build acl
