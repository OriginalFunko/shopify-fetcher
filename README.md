# shopify-fetcher

This library returns all products or ids from a Shopify collection or product publication using the GraphQL endpoint. It automatically handles pagination.

---

## Usage:

Inside of your project, do:

```
yarn add @originalfunko/shopify-fetcher
```

Simply include the library:

```js
const shopifyFetcher = require('shopify-fetcher');
```

Initialize your config settings:

```js
shopifyFetcher.init({
    SHOPIFY_API_URI: '<API_URI>',
    SHOPIFY_API_TOKEN: '<API_TOKEN>',
});
```

Then call it as needed:

```js
let productsResult = await shopifyFetcher.collection.fetchIt(id);
let productIds = await shopifyFetcher.collection.parseIt(id, productsResult);
products = products.concat(productIds);
```

---

### Configuration:

Beyond the `SHOPIFY_API_URI` and `SHOPIFY_API_TOKEN` settings (which will inherit `process.env.SHOPIFY_API_URI` and `process.env.SHOPIFY_API_TOKEN` if available), here is the complete list of settings:

```js
shopifyFetcher.init({
    SHOPIFY_API_URI: '<API_URI>',
    SHOPIFY_API_TOKEN: '<API_TOKEN>',

    SHOPIFY_API_RATE_LIMIT_PERCENTAGE: 30,
    SHOPIFY_API_RATE_LIMIT_MIN: 5000,
    SHOPIFY_API_RATE_LIMIT_MAX: 10000,

    SHOPIFY_API_GRAPHQL_MEDIA: 7,
    SHOPIFY_API_GRAPHQL_PRODUCTS: 15,
    SHOPIFY_API_GRAPHQL_VARIANTS: 10,
});
```
