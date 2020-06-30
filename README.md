# shopify-collection-fetcher

This library returns all products or ids from a Shopify collection using the GraphQL endpoint. It automatically handles pagination.

Inside of your project, do:

```
yarn add shopify-collection-fetcher
```

Simply include the library:

```js
const shopifyCollectionFetcher = require('shopify-collection-fetcher');
```

Initialize your config settings:

```js
shopifyCollectionFetcher.init({
    SHOPIFY_API_URI: '<API_URI>',
    SHOPIFY_API_TOKEN: '<API_TOKEN>',
});
```

Then call it as needed:

```js
let productsResult = await shopifyCollectionFetcher.fetchIt(id);
let productIds = await shopifyCollectionFetcher.parseIt(id, productsResult);
products = products.concat(productIds);
```

Advanced configuration:

Beyond the `SHOPIFY_API_URI` and `SHOPIFY_API_TOKEN` settings (which will inherit `process.env.SHOPIFY_API_URI` and `process.env.SHOPIFY_API_TOKEN` if available), here is the complete list of settings available:

```js
shopifyCollectionFetcher.init({
    SHOPIFY_API_URI: '<API_URI>',
    SHOPIFY_API_TOKEN: '<API_TOKEN>',
    SHOPIFY_API_RATE_LIMIT: 50,
    SHOPIFY_API_GRAPHQL_PRODUCTS: 20,
});
```
