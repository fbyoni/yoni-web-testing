

window.AnowaveListeners =
{
    attach: function () {

        document.addEventListener('ec.dom.loaded', event => {
            
            const preferences = event?.detail?.data?.preferences ?? null;
            
            const utm = event?.detail?.data?.utm;

            if (true === preferences?.server?.utm && Object.keys(utm).length > 0)
            {
                fetch(window.Shopify.routes.root + 'cart/update.js', 
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ attributes: utm })
                }).then(response => response.json()).then(data => 
                {
                    console.debug('Saved UTM parameters in cart attributes');
                });
            }
        });

        document.addEventListener('ec.select.item', event => {
            let candidate = {}, clicked_id = event?.detail.id.toString();

            if ('undefined' !== ShopifyAnalytics) {
                ShopifyAnalytics?.meta?.products?.forEach((product, index) => {


                    if (clicked_id === product.id.toString()) {
                        candidate = {
                            item_id: product?.id,
                            item_name: product?.variants?.[0]?.name,
                            item_brand: product?.vendor,
                            price: product?.variants?.[0]?.price / 100,
                            index: (1 + Number(index)),
                            quantity: 1
                        }

                        if (event?.detail?.collection) {
                            candidate['item_list_id'] = event?.detail?.collection;
                            candidate['item_category'] = event?.detail?.collection;
                            candidate['item_list_name'] = event?.detail?.collection;
                        }
                    }
                });
            }

            if (!candidate.hasOwnProperty('item_id')) {
                candidate = { item_id: clicked_id }
            }

            if (candidate.hasOwnProperty('item_id')) {
                let payload =
                {
                    event: 'select_item',
                    ecommerce:
                    {
                        items: [candidate],
                        value: 0,
                        currency: event?.detail?.shop?.currency
                    }
                };

                this.proxy(payload);
            }
        });

        document.addEventListener('ec.cart.add', event => {
            let data = event?.detail?.data;

            if (data.hasOwnProperty('items')) {
                data = data?.items?.shift();
            }

            let payload =
            {
                event: 'add_to_cart',
                ecommerce:
                {
                    items:
                        [
                            {
                                item_id: this.getProductItemId(data),
                                item_name: data?.product_title,
                                item_variant: data?.variant_title,
                                item_variant_id: data?.variant_id,
                                item_brand: data?.vendor,
                                item_type: data?.product_type,
                                price: data?.final_price / 100,
                                quantity: data?.quantity,
                                discount: data?.total_discount,
                                google_business_vertical: 'retail'
                            }
                        ],
                    value: data?.final_price / 100,
                    currency: event?.detail?.shop?.currency,
                }
            };

            this.proxy(payload).proxyMeta('AddToCart',
                {
                    value: data?.final_price / 100,
                    currency: event?.detail?.shop?.currency,
                    content_ids: payload.ecommerce.items.map(item => JSON.stringify(item.item_id)),
                    content_type: 'product'
                }).proxyTikTok('AddToCart',
                {
                    contents: payload.ecommerce.items.map(item => {
                        return {
                            content_id: item.item_id,
                            content_name: item.item_name,
                            quantity: item.quantity,
                            brand: item.item_brand,
                            price: item.price
                        }
                    }),
                    currency: event?.detail?.shop?.currency,
                    value: data?.final_price / 100,
                    content_type: 'product'
                });

             if (1 ===  Number(this.options?.preferences?.dataLayer?.summary))
             {
                document.addEventListener('ec.cart.summary', event => 
                {
                    this.proxy(event.detail);
                });

                this.trackCart(
                {
                    event:'summary_cart',
                    eventCustom:'ec.cart.summary'
                });
             }
        });

        document.addEventListener('ec.cart.view', event => 
        {
            this.proxy(event.detail).proxyMeta('ViewCart',
                {
                    value: event?.detail?.ecommerce?.value,
                    currency: event?.detail?.shop?.currency,
                    content_ids: event?.detail?.ecommerce.items.map(item => JSON.stringify(item.item_id)),
                    content_type: 'product'
                });
        });

        document.addEventListener('ec.cart.update', event => {
            const data = event?.detail?.data;
            const args = event?.detail?.args;

            const [resource, config] = Array.isArray(args) ? args : [];

            if (config?.body) {
                let params = {};

                try {
                    params = JSON.parse(config?.body);
                }
                catch (e) {
                    params = {};
                }

                switch (true) {
                    case params.hasOwnProperty('updates'):

                        Object.keys(params?.updates).forEach(key => {
                            document.querySelectorAll('line-item').forEach(item => {
                                if (key === item?.dataset?.key) {
                                    let clicked_id = item?.dataset?.productId;

                                    if (ShopifyAnalytics?.meta?.product && ShopifyAnalytics?.meta?.product?.id == clicked_id) {
                                        const product = ShopifyAnalytics?.meta?.product;

                                        candidate =
                                        {
                                            item_id: product?.id,
                                            item_name: product?.variants?.[0]?.name,
                                            item_brand: product?.vendor,
                                            price: product?.variants?.[0]?.price / 100,
                                            index: 1,
                                            quantity: 1
                                        }

                                        let payload =
                                        {
                                            event: 'cart_update',
                                            ecommerce:
                                            {
                                                items: [candidate],
                                                value: product?.variants?.[0]?.price / 100,
                                                currency: Shopify?.currency?.active,
                                            }
                                        };
                                        this.proxy(payload);
                                    }
                                }
                            })
                        });

                        break;
                    case params.hasOwnProperty('discount'):

                        let items = [], value = 0;

                        data.items?.forEach(item => {
                            items.push(this.getItem(item));

                            value += item.presentment_price;
                        });

                        let payload =
                        {
                            event: 'apply_discount',
                            ecommerce:
                            {
                                items: items,
                                value: value,
                                currency: event?.detail?.shop?.currency,
                                discount: params.discount
                            }
                        };
                        this.proxy(payload);

                        break;
                }
            }
        });

        document.addEventListener('ec.cart.change', event => 
        {
            const data = event?.detail?.data;

            let items = [], dataset = [], event_name = 'remove_from_cart';

            if (data?.items_removed?.length) {
                dataset = data?.items_removed;

                event_name = 'remove_from_cart';
            }

            if (data?.items_added?.length) {
                dataset = data?.items_added;

                event_name = 'add_to_cart';
            }

            let value = 0;

            dataset?.forEach(item => {
                items.push(this.getItem(item));

                value += item.presentment_price;
            });

            let payload =
            {
                event: event_name,
                ecommerce:
                {
                    items: items,
                    currency: event?.detail?.shop?.currency,
                    value: value
                }
            };

            this.proxy(payload).proxyMeta(event_name === 'remove_from_cart' ? 'RemoveFromCart' : 'AddToCart',
                {
                    value: data?.final_price / 100,
                    currency: event?.detail?.shop?.currency,
                    content_ids: payload.ecommerce.items.map(item => JSON.stringify(item.item_id)),
                    content_type: 'product'
                });
        });

        document.addEventListener('ec.slideshow.view', event => 
        {
            const items = event?.detail?.items?.map(item => item.item_id);
            
            async function fetchProductsByIds(items, domain) 
            {
                const endpoint = `https://${domain}/apps/gtm?ids=${items.join(',')}&shop=${domain}`;

                const response = await fetch(endpoint, 
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "X-AWT":        event?.detail?.token?.token,
                    }
                });

                const { data, errors } = await response.json();

                if (errors && errors.length > 0) 
                {
                }

                // data.nodes is an array; some entries can be null if an ID isn't a Product or not found
                return data?.nodes?.filter((node) => node != null);
            }

            fetchProductsByIds(items, event?.detail?.domain).then(products => 
            {
                const category      = 'Slideshow';
                const category_id   = 'slideshow';

                let payload =
                {
                    event: 'view_item_list_slideshow',
                    ecommerce:
                    {
                        items: products.map((product, index) => {
                            return {
                                item_id:            product?.id?.split('/')?.pop(),
                                item_name:          product?.title,
                                item_brand:         product?.vendor,
                                item_list_id:       category_id,
                                item_list_name:     category,
                                price:              Number(product?.variants?.edges?.[0]?.node?.price?.amount),
                                index:              (1 + index),
                                quantity:           1,
                                google_business_vertical: "retail"
                            }
                        }),
                        currency: event?.detail?.currency,
                    }
                };

                this.proxy(payload);
            });
        });

        document.addEventListener('ec.capture.utm', event => 
        {

        });

        return true;
    }
}