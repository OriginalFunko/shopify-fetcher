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

const shopifyFetcher = {
  // Configs:
  SHOPIFY_API_URI: process.env.SHOPIFY_API_URI,
  SHOPIFY_API_TOKEN: process.env.SHOPIFY_API_TOKEN,

  SHOPIFY_API_RATE_LIMIT_PERCENTAGE: 30,
  SHOPIFY_API_RATE_LIMIT_MIN: 5000,
  SHOPIFY_API_RATE_LIMIT_MAX: 10000,

  SHOPIFY_API_GRAPHQL_MEDIA: 7,
  SHOPIFY_API_GRAPHQL_PRODUCTS: 15,
  SHOPIFY_API_GRAPHQL_VARIANTS: 10,

  // Fetcher types:
  collection: {},
  productPublication: {},
  product: {}
}

shopifyFetcher.init = (configObj) => {
  shopifyFetcher.SHOPIFY_API_URI = configObj.SHOPIFY_API_URI || shopifyFetcher.SHOPIFY_API_URI
  shopifyFetcher.SHOPIFY_API_TOKEN = configObj.SHOPIFY_API_TOKEN || shopifyFetcher.SHOPIFY_API_TOKEN

  shopifyFetcher.SHOPIFY_API_GRAPHQL_PRODUCTS = configObj.SHOPIFY_API_GRAPHQL_PRODUCTS || shopifyFetcher.SHOPIFY_API_GRAPHQL_PRODUCTS
  shopifyFetcher.SHOPIFY_API_GRAPHQL_VARIANTS = configObj.SHOPIFY_API_GRAPHQL_VARIANTS || shopifyFetcher.SHOPIFY_API_GRAPHQL_VARIANTS
  shopifyFetcher.SHOPIFY_API_GRAPHQL_MEDIA = configObj.SHOPIFY_API_GRAPHQL_MEDIA || shopifyFetcher.SHOPIFY_API_GRAPHQL_MEDIA

  shopifyFetcher.SHOPIFY_API_RATE_LIMIT_PERCENTAGE = configObj.SHOPIFY_API_RATE_LIMIT_PERCENTAGE || shopifyFetcher.SHOPIFY_API_RATE_LIMIT_PERCENTAGE
  shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MIN = configObj.SHOPIFY_API_RATE_LIMIT_MIN || shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MIN
  shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MAX = configObj.SHOPIFY_API_RATE_LIMIT_MAX || shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MAX
}

// ***********************************************
// ** Handle Shopify Throttling by waiting and  **
// ** allowing the request cost to restore.     **
// ***********************************************
shopifyFetcher.handleCost = async (cost) => {
  console.log(`COST: ${JSON.stringify(cost)}`)

  if (cost && cost.throttleStatus && cost.throttleStatus.maximumAvailable && cost.throttleStatus.currentlyAvailable) {
    const max = cost.throttleStatus.maximumAvailable

    // Calculate the percentage
    const percentageUsed = ((cost.throttleStatus.maximumAvailable - cost.throttleStatus.currentlyAvailable) / cost.throttleStatus.maximumAvailable) * 100

    // Check percentage of usage
    if (percentageUsed >= shopifyFetcher.SHOPIFY_API_RATE_LIMIT_PERCENTAGE) {
      console.info(`Getting close to API limit, ${percentageUsed}% of ${max}`)
      await sleep(randomIntFromInterval(shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MIN, shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MAX))
    }
  }
}

/**
 * Fetch product list in a Collection in Shopify using GraphQL
 *
 * @param afterCursor
 */
shopifyFetcher.collection.fetchIt = async (collectionId, afterCursor = null) => {
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
            title
            products(first: ${shopifyFetcher.SHOPIFY_API_GRAPHQL_PRODUCTS}, sortKey: COLLECTION_DEFAULT${after}) {
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
    url: shopifyFetcher.SHOPIFY_API_URI,
    headers: {
      'X-Shopify-Access-Token': `${shopifyFetcher.SHOPIFY_API_TOKEN}`,
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
          return response.json()
        } else {
          console.error(`Get collections failed(${response.status}): ${JSON.stringify(response)}`)

          // The Shopify status codes:
          //     520: is a known issue, they choose not to disclose as an issue
          //     429: happens if too many requests are made during a small window
          //     500: random error that is seen but with no real response
          if (response.status === 429 || response.status === 520 || response.status === 500) {
            // Wait
            await sleep(randomIntFromInterval(shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MIN, shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MAX))

            console.error(`RETRYING collections after error(${response.status}): ${collectionId} with after: ${afterCursor}`)
            // Retry
            return shopifyFetcher.collection.fetchIt(collectionId, afterCursor)
          }
        }
      }
    )
    .then( async (jsonData) => {
        // Check for throttled response
        if (jsonData &&
            jsonData.errors &&
            (/throttled/i).test(JSON.stringify(jsonData.errors))) {
          console.error('Error: THROTTLED limit reached.... waiting to try again...')
          await shopifyFetcher.handleCost(jsonData.extensions.cost)

          console.error(`RETRYING collection: ${collectionId} with after: ${afterCursor}`)

          // Retry
          return shopifyFetcher.collection.fetchIt(collectionId, afterCursor)
        } else {
          return jsonData
        }
      }
    )
    .catch(
      (err) => {
        console.error(err)
      }
    )

  return result
}

/**
 * Parse the results from fetchIt() function
 *
 * @param data
 * @returns {Promise<void>}
 */
shopifyFetcher.collection.parseIt = async (collectionId, responseData) => {
  let items = []
  if (responseData !== null) {
    // let response = JSON.parse(data)

    if (responseData &&
        responseData.data &&
        responseData.data.collections &&
        responseData.data.collections.edges &&
        Array.isArray(responseData.data.collections.edges) &&
        responseData.data.collections.edges.length === 1 &&
        responseData.data.collections.edges[0].node &&
        responseData.data.collections.edges[0].node.products &&
        responseData.data.collections.edges[0].node.products.edges &&
        Array.isArray(responseData.data.collections.edges[0].node.products.edges) &&
        responseData.data.collections.edges[0].node.products.edges.length > 0) {
      const products = responseData.data.collections.edges[0].node.products.edges

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
      if (responseData.data.collections &&
        responseData.data.collections.edges &&
        Array.isArray(responseData.data.collections.edges) &&
        responseData.data.collections.edges[0].node &&
        responseData.data.collections.edges[0].node.products &&
        responseData.data.collections.edges[0].node.products.pageInfo &&
        responseData.data.collections.edges[0].node.products.pageInfo.hasNextPage &&
        responseData.data.collections.edges[0].node.products.pageInfo.hasNextPage === true) {
        const lastProductIndex = responseData.data.collections.edges[0].node.products.edges.length - 1
        const cursor = responseData.data.collections.edges[0].node.products.edges[lastProductIndex].cursor
        const nextPageData = await shopifyFetcher.collection.fetchIt(collectionId, cursor)
        const nextPageResults = await shopifyFetcher.collection.parseIt(collectionId, nextPageData)

        items = items.concat(nextPageResults)
      }
    }
  }

  console.debug(`FOUND ${items.length} items.`)
  return items
}

// *******************************************
// **   Get products from Shopify GraphQL   **
// *******************************************
shopifyFetcher.productPublication.fetchIt = async (publicationId, afterCursor = null) => {
  let after = ''
  // After cursor comes from last product item in list
  if (afterCursor) {
    after = `,after:"${afterCursor}"`
  }

  const query = /* GraphQL */ `
      {
        publication(id:"${publicationId}") {
          products(first:${shopifyFetcher.SHOPIFY_API_GRAPHQL_PRODUCTS}${after}){
            edges{
              node{
                id
                title
                handle
                descriptionHtml
                productType
                vendor
                tags
                options {
                  position
                  values
                  name
                }
                seo {
                  description
                  title
                }
                createdAt
                publishedAt
                updatedAt
                variants(first:${shopifyFetcher.SHOPIFY_API_GRAPHQL_VARIANTS}) {
                  edges {
                    node {
                      id
                      title
                      price
                      compareAtPrice
                      sku
                      inventoryQuantity
                      selectedOptions {
                        name
                        value
                      }
                    }
                  }
                }
                media(first:${shopifyFetcher.SHOPIFY_API_GRAPHQL_MEDIA},sortKey: POSITION) {
                  edges{
                    node{
                      ... fieldsForMediaTypes
                    }
                  }

                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }

      }
      fragment fieldsForMediaTypes on Media {
        alt
        mediaContentType

        ... on Video {
          id
          preview {
            image {
              altText
              originalSrc
            }
          }
          sources {
            format
            height
            mimeType
            url
            width
          }
        }
        ... on ExternalVideo {
          id
          embeddedUrl
        }
        ... on Model3d {
          sources {
            format
            mimeType
            url
          }
        }
        ... on MediaImage {
          id
          image {
            originalSrc
          }
        }
      }
  `
  const config = {
    url: shopifyFetcher.SHOPIFY_API_URI,
    headers: {
      'X-Shopify-Access-Token': `${shopifyFetcher.SHOPIFY_API_TOKEN}`,
      'Content-Type': 'application/graphql',
      Accept: 'application/json'
    },
    method: 'POST',
    body: query
  }

  // console.info(`
  //   curl ${config.url} \\
  //     -X ${config.method} \\
  //     -d '${config.body}' \\
  //     -H "Content-Type: application/json"
  //   `)

  // console.log(`Attempting call to ${config.url} `)
  // console.debug(`Headers: ${JSON.stringify(config.headers)}`)
  // console.debug(`Attempting query: ${query}`)

  const result = await fetch(config.url, config)
    .then(
      async (response) => {
        if (response && response.ok) {
          return response.json()
        } else {
          console.error(`Get products failed(${response.status}): ${JSON.stringify(response)}`)

          // The Shopify status codes:
          //     520: is a known issue, they choose not to disclose as an issue
          //     429: happens if too many requests are made during a small window
          //     500: random error that is seen but with no real response
          if (response.status === 429 || response.status === 520 || response.status === 500) {
            // Wait
            await sleep(randomIntFromInterval(shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MIN, shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MAX))

            console.error(`RETRYING publication after error(${response.status}): ${publicationId} with cursor: ${afterCursor}`)
            // Retry
            return shopifyFetcher.productPublication.fetchIt(publicationId, afterCursor)
          }
        }
      }
    )
    .then(
      async (jsonData) => {
        // Check for throttled response
        if (jsonData &&
            jsonData.errors &&
            (/throttled/i).test(JSON.stringify(jsonData.errors))) {
          console.error('Error: THROTTLED limit reached.... waiting to try again...')
          await shopifyFetcher.handleCost(jsonData.extensions.cost)

          console.error(`RETRYING publication: ${publicationId} with cursor: ${afterCursor}`)

          // Retry
          return shopifyFetcher.productPublication.fetchIt(publicationId, afterCursor)
        } else {
          return jsonData
        }
      }
    )
    .catch(
      (err) => {
        console.error(err)
      }
    )

  return result
}

shopifyFetcher.product.fetchIt = async (productId, publicationId) => {

  const query = /* GraphQL */ `
      {
        product(id:"gid://shopify/Product/${productId}") {
          publishedOnPublication(publicationId:"${publicationId}")
          id
          title
          handle
          descriptionHtml
          productType
          vendor
          tags
            options {
              position
              values
              name
            }
          seo {
            description
            title
          }
          createdAt
          publishedAt
          updatedAt
          variants(first:${shopifyFetcher.SHOPIFY_API_GRAPHQL_VARIANTS}) {
            edges {
              node {
                id
                title
                price
                compareAtPrice
                sku
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
          media(first:${shopifyFetcher.SHOPIFY_API_GRAPHQL_MEDIA},sortKey: POSITION) {
            edges{
              node{
                ... fieldsForMediaTypes
              }
            }
          }
        }
      }
      fragment fieldsForMediaTypes on Media {
        alt
        mediaContentType

        ... on Video {
          id
          preview {
            image {
              altText
              originalSrc
            }
          }
          sources {
            format
            height
            mimeType
            url
            width
          }
        }

        ... on ExternalVideo {
          id
          embeddedUrl
        }

        ... on Model3d {
          sources {
            format
            mimeType
            url
          }
        }

        ... on MediaImage {
          id
          image {
            originalSrc
          }
        }
      }
  `

  const config = {
    url    : `${shopifyFetcher.SHOPIFY_API_URI}`,
    headers: {
      'X-Shopify-Access-Token': `${shopifyFetcher.SHOPIFY_API_TOKEN}`,
      'Content-Type'          : 'application/graphql',
      Accept                  : 'application/json'
    },
    method : 'POST',
    body   : query
  }

  // logger.info(`
  //   curl ${config.url} \\
  //     -X ${config.method} \\
  //     -d '${config.body}' \\
  //     -H "Content-Type: application/json"
  //   `)

  // console.log(`Attempting call to ${config.url} `)
  // console.debug(`Headers: ${JSON.stringify(config.headers)}`)
  // console.debug(`Attempting query: ${query}`)

  const result = await fetch(config.url, config)
      .then(async response => {
        if (response && response.ok) {
          return response.json()
        } else {
          console.error(
              `Get product by ID failed(${response.status}): ${JSON.stringify(response)}`
          )
          if (response.status === 429 || response.status === 520 || response.status === 500) {
            // Wait
            await sleep(randomIntFromInterval(shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MIN, shopifyFetcher.SHOPIFY_API_RATE_LIMIT_MAX))

            console.error(`RETRYING fetch for product: ${productId} and publication: ${publicationId}`)

            // Retry
            return shopifyFetcher.product.fetchIt(productId,publicationId)
          }
        }
      })
      .then( async (jsonData) => {
        // Check for throttled response
        if (jsonData &&
            jsonData.errors &&
            (/throttled/i).test(JSON.stringify(jsonData.errors))) {
          console.error('Error: THROTTLED limit reached.... waiting to try again...')
          await shopifyFetcher.handleCost(jsonData.extensions.cost)

          console.error(`RETRYING fetch for product: ${productId} and publication: ${publicationId}`)

          // Retry
          return shopifyFetcher.product.fetchIt(productId, publicationId)
        } else {
          return jsonData
        }
      })
      .catch(err => {
        console.error(err)
      })
  return result
}

module.exports = shopifyFetcher
