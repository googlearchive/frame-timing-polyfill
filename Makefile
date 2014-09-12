all: build acl

build:
	cat src/smoothness_data_collector.js src/web_smoothness.js > bin/web_smoothness.js
	cat src/smoothness_data_collector.js src/fps_meter_element.js >> bin/fps_meter_element.js

acl:
	find . -name \*.html -exec chmod 664 {} \;
	find . -name \*.css -exec chmod 664 {} \;
	find . -name \*.js -exec chmod 664 {} \;
	find . -name \*.png -exec chmod 664 {} \;
	find . -not -path '*/\.*' -type d -exec chmod 755 {} \;
