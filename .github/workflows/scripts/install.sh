# rm -rf ./node_modules
# touch .npmrc
# echo "//npm.pkg.github.com/:_authToken=$NPM_TOKEN
# @little-universe:registry=https://npm.pkg.github.com" > .npmrc
# npm install @little-universe/do-not-allow-missing-properties --registry=https://npm.pkg.github.com/
# rm .npmrc
# npm ci
# echo "End execution"

# 
npm ci
