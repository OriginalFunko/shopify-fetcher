# shopify-collection-fetcher

This library returns all products or ids from a Shopify collection using the GraphQL endpoint. It automatically handles pagination.

```js
shopifyCollectionFetcher.init(<API_URI>, <API_TOKEN>)
let productsResult = await shopifyCollectionFetcher.fetchIt(id);
let productIds = await shopifyCollectionFetcher.parseIt(id, productsResult);
products = products.concat(productIds);
```
