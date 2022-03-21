touch .npmrc
echo "//npm.pkg.github.com/:_authToken=$NPM_TOKEN
registry=https://npm.pkg.github.com/
@little-universe:registry=https://npm.pkg.github.com" > .npmrc
npm ci
rm .npmrc
cat .npmrc
echo "End execution"
