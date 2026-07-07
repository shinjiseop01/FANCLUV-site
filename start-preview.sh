#!/bin/bash
export PATH="/Users/jiseop/.nvm/versions/node/v20.20.2/bin:$PATH"
cd /Users/jiseop/fancluv-site
exec node node_modules/.bin/vite preview --port 4173 --strictPort
