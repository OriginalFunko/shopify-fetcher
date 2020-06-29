# shopify-collection-fetcher

This library returns all products or ids from a Shopify collection using the GraphQL endpoint. It automatically handles pagination.

Simply include the library:

```js
const shopifyCollectionFetcher = require('shopify-collection-fetcher');
shopifyCollectionFetcher.init(<API_URI>, <API_TOKEN>)
```

Then call it as needed:

```js
let productsResult = await shopifyCollectionFetcher.fetchIt(id);
let productIds = await shopifyCollectionFetcher.parseIt(id, productsResult);
products = products.concat(productIds);
```
