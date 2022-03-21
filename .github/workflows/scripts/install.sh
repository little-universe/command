rm -rf ./node_modules
touch .npmrc
echo "//npm.pkg.github.com/:_authToken=$NPM_TOKEN
@little-universe:registry=https://npm.pkg.github.com" > .npmrc
npm ci
rm .npmrc
echo "End execution"

