#!/bin/bash

cd "$(dirname "$0")"

node ./index.js -f urls.txt

read -p 'Press ENTER key to exit'
exit;
