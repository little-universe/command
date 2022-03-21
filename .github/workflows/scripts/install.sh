touch .npmrc
echo "//npm.pkg.github.com/:_authToken=$NPM_TOKEN
registry=https://npm.pkg.github.com/
@little-universe:registry=https://npm.pkg.github.com" > .npmrc
npm install @little-universe/do-not-allow-missing-properties
rm .npmrc
cat .npmrc
npm ci
echo "End execution"
