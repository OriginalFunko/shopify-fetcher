const fetch = require('node-fetch')

// ***********************************************
// ** Generate a random integer from min to max **
// ***********************************************
const randomIntFromInterval = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

/**
 * Parse out just the ID from the GraphQL ID string
 *
 * Example input: gid://shopfiy/Product/[ID]
 *        output: [ID]
 *
 * @param graphqlId
 * @returns {Promise<string>}
 */
const parseIdFromGraphQLId = async (graphqlId) => {
  let result = ''

  if (graphqlId) {
    result = graphqlId.substring(graphqlId.lastIndexOf('/') + 1)
  }

  return result
}

const sleep = async (ms) => {
  console.debug(`Waiting for ${ms} milliseconds.`)
  return new Promise(resolve => setTimeout(resolve, ms))
}

const shopifyCollectionFetcher = {
  SHOPIFY_API_URI: process.env.SHOPIFY_API_URI,
  SHOPIFY_API_TOKEN: process.env.SHOPIFY_API_TOKEN,
  SHOPIFY_API_RATE_LIMIT: 50,
  SHOPIFY_API_GRAPHQL_PRODUCTS: 20
}

shopifyCollectionFetcher.init = (configObj) => {
  shopifyCollectionFetcher.SHOPIFY_API_URI = configObj.SHOPIFY_API_URI || shopifyCollectionFetcher.SHOPIFY_API_URI
  shopifyCollectionFetcher.SHOPIFY_API_TOKEN = configObj.SHOPIFY_API_TOKEN || shopifyCollectionFetcher.SHOPIFY_API_TOKEN
  shopifyCollectionFetcher.SHOPIFY_API_RATE_LIMIT = shopifyCollectionFetcher.SHOPIFY_API_RATE_LIMIT || 50
  shopifyCollectionFetcher.SHOPIFY_API_GRAPHQL_PRODUCTS = configObj.SHOPIFY_API_GRAPHQL_PRODUCTS || 20
}

/**
 * Fetch product list in a Collection in Shopify using GraphQL
 *
 * @param afterCursor
 */
shopifyCollectionFetcher.fetchIt = async (collectionId, afterCursor = null) => {
  let after = ''
  // After cursor comes from last product item in list
  if (afterCursor) {
    after = `,after:"${afterCursor}"`
  }
  const query = /* GraphQL */ `
    {
      collections(first: 1, query: "id:${collectionId}") {
        pageInfo {
          hasNextPage
        }
        edges {
          node {
            id
            products(first: ${shopifyCollectionFetcher.SHOPIFY_API_GRAPHQL_PRODUCTS}, sortKey: COLLECTION_DEFAULT${after}) {
              pageInfo {
                hasNextPage
              }
              edges {
                cursor
                node {
                  id
                }
              }
            }
          }
        }
      }
    }
  `
  const config = {
    url: process.env.FUNKO_SHOPIFY_API_URI,
    headers: {
      'X-Shopify-Access-Token': `${process.env.FUNKO_SHOPIFY_API_TOKEN}`,
      'Content-Type': 'application/graphql',
      Accept: 'application/json'
    },
    method: 'POST',
    body: query
  }

  console.log(`Attempting call to ${config.url} `)
  console.debug(`Headers: ${JSON.stringify(config.headers)}`)
  console.debug(`Attempting query: ${query}`)

  const result = await fetch(config.url, config)
    .then(
      async (response) => {
        if (response && response.ok) {
          const limitHeader = response.headers.get('HTTP_X_SHOPIFY_SHOP_API_CALL_LIMIT')
          const limitCurrent = limitHeader ? limitHeader.substring(0, limitHeader.indexOf('/')) : 1
          const limitMax = limitHeader ? limitHeader.substring(limitHeader.indexOf('/') + 1, limitHeader.length) : 1

          const limit = limitCurrent / limitMax * 100

          // Check API limit, if more than 50%.... wait
          if (limit >= shopifyCollectionFetcher.SHOPIFY_API_RATE_LIMIT) {
            console.log(`Getting close to API limit, ${limit}% of ${limitMax}`)
            // await sleep(randomIntFromInterval(1000, 5000))
          }

          console.debug(`--------- Checking call limit header ${limitHeader}`)
          return response.json()
        } else {
          console.error(`Get products failed(${response.status}): ${JSON.stringify(response)}`)

          if (response.status === 429) {
            // Wait
            await sleep(randomIntFromInterval(1000, 5000))

            // Retry
            return fetchIt(collectionId, afterCursor)
          }
        }
      }
    )
    .then(
      (jsonData) => {
        return jsonData
      }
    )
    .catch(
      (err) => {
        console.error(err)
      }
    )

  return { result }
}

/**
 * Parse the results from fetchIt() function
 *
 * @param data
 * @returns {Promise<void>}
 */
shopifyCollectionFetcher.parseIt = async (collectionId, responseData) => {
  const items = []
  if (responseData !== null) {
    // let response = JSON.parse(data)

    if (responseData &&
        responseData.result &&
        responseData.result.data &&
        responseData.result.data.collections &&
        responseData.result.data.collections.edges &&
        Array.isArray(responseData.result.data.collections.edges) &&
        responseData.result.data.collections.edges.length === 1 &&
        responseData.result.data.collections.edges[0].node &&
        responseData.result.data.collections.edges[0].node.products &&
        responseData.result.data.collections.edges[0].node.products.edges &&
        Array.isArray(responseData.result.data.collections.edges[0].node.products.edges) &&
        responseData.result.data.collections.edges[0].node.products.edges.length > 0) {
      const products = responseData.result.data.collections.edges[0].node.products.edges

      if (products && Array.isArray(products)) {
        const flatArr = await Promise.all(products.map(
          (obj) => {
            return parseIdFromGraphQLId(obj.node.id)
          }
        ))

        console.debug(`Found ${flatArr.length} products for collection ID: ${collectionId}`)

        // Add items
        items = items.concat(flatArr)
      }

      // Handle additional pages of data
      if (responseData.result.data.collections &&
        responseData.result.data.collections.edges &&
        Array.isArray(responseData.result.data.collections.edges) &&
        responseData.result.data.collections.edges[0].node &&
        responseData.result.data.collections.edges[0].node.products &&
        responseData.result.data.collections.edges[0].node.products.pageInfo &&
        responseData.result.data.collections.edges[0].node.products.pageInfo.hasNextPage &&
        responseData.result.data.collections.edges[0].node.products.pageInfo.hasNextPage === true) {
        const lastProductIndex = responseData.result.data.collections.edges[0].node.products.edges.length - 1
        const cursor = responseData.result.data.collections.edges[0].node.products.edges[lastProductIndex].cursor
        const nextPageData = await fetchIt(collectionId, cursor)
        const nextPageResults = await parseProductsFromCollection(collectionId, nextPageData)

        concat = items.concat(nextPageResults)
      }
    }
  }

  log.debug(`FOUND ${items.length} items.`)
  return items
}

module.exports = shopifyCollectionFetcher
