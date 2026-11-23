# Etimaad Shopify app

Not generated yet.

## Before generating

- Create a Shopify Partner account and a development store.
- Generate the app here with Shopify's official app template (Shopify CLI).
- Request protected customer data access (phone). See blueprint section 19.3.

## What it will do

- Receive order and fulfillment webhooks and send events to Etimaad.
- Run the `POST_ORDER` risk check and tag orders.
- Page for bulk "mark outcome + reason code".
- Handle the mandatory privacy webhooks.
