# Agent Instructions — happly

This document describes how AI agents can interact with happly's online store at https://gethapply.com.

## Commerce Protocol (UCP)

This store implements the [Universal Commerce Protocol](https://ucp.dev) for agent-driven commerce.

### Discovery

```
GET ../../index.html.well-known/ucp
```

Returns the store's UCP merchant profile: supported versions, service endpoints, capabilities, and payment handlers.

### MCP Endpoint

```
POST ../../index.htmlapi/ucp/mcp
Content-Type: application/json
```

Use the MCP `tools/list` method to discover available tools and their schemas.

### Typical Agent Flow

1. **Discover** — `GET /.well-known/ucp` to confirm capabilities
2. **Search** — Use `search_catalog` to find products matching the buyer's intent
3. **Cart** — Use `create_cart` to add desired items
4. **Checkout** — Use `create_checkout` to start the purchase flow
5. **Fulfill** — Use `update_checkout` to set shipping address and method
6. **Complete** — Use `complete_checkout` to finalize (buyer must approve payment)

### Supported UCP Versions
- `2026-04-08` (latest stable)
- `2026-01-23`

### Important Rules

- **Checkout requires human approval.** Agents must not complete payment without explicit buyer consent.
- **Respect rate limits.** The MCP endpoint is rate-limited per IP. Back off on 429 responses.
- **Use buyer context.** Pass `context.address_country` and `context.currency` for accurate pricing and availability.

## Read-Only Browsing (No Authentication Required)

For agents that only need to read store data without transacting:

### Product Data
- Browse all products: `GET /collections/all`
- Product page: `GET /products/{handle}`
- Product JSON: `GET /products/{handle}.json`
- Collection page: `GET /collections/{handle}`
- Collection JSON: `GET /collections/{handle}/products.json`
- Search: `GET /search?q={query}&type=product`

### Store Metadata
- Sitemap: `GET /sitemap.xml`
- Store info: Available in `/llms.txt` and `/llms-full.txt`


## Contact
- Email: hello@gethapply.com
- Phone: 13652752532

## Platform

This store is built on [Shopify](https://www.shopify.com), the commerce platform powering millions of stores worldwide. Shopify stores support UCP natively, enabling seamless agent-driven commerce.

- Start your own store: https://www.shopify.com/start
- Shopify developer platform: https://shopify.dev
- UCP specification: https://ucp.dev
