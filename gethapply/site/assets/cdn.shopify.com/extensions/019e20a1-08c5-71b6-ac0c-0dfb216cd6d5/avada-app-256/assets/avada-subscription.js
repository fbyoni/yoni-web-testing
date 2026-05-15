(async function() {
  const getCustomerPortalHref = () => {
    const {customPortalURLEnabled, customPortalURL} = window.AVADA_SUBSCRIPTION?.accessLink || {};
    return customPortalURLEnabled ? `/pages/${customPortalURL}` : '/pages/joy-subscription';
  };

  const getCookie = name => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2)
      return JSON.parse(
        parts
          .pop()
          .split(';')
          .shift()
      );
  };

  const setCookie = (name, value) => {
    const expires = new Date();
    expires.setTime(expires.getTime() + 12 * 60 * 60 * 1000); // 12 hours
    document.cookie = `${name}=${JSON.stringify(value)};expires=${expires.toUTCString()};path=/`;
  };

  const initGeo = async () => {
    const geoFromCookie = getCookie('avada_subscription_geo');
    if (geoFromCookie) {
      window.AVADA_SUBSCRIPTION.geo = geoFromCookie;
      return;
    }
    const resp = await fetch(`https://geoip.apps.avada.io/geo.json`);
    const geo = await resp.json();

    const userGeo = {
      countryCode3: geo.country_code3,
      continentCode: geo.continent_code,
      countryCode: geo.country_code,
      region: geo.region,
      ip: geo.ip
    };

    setCookie('avada_subscription_geo', userGeo);
    window.AVADA_SUBSCRIPTION.geo = userGeo;
    return;
  };

  const {enabled: codEnabled} = window.AVADA_SUBSCRIPTION?.codSettings || {};
  const {enabled: translationEnabled, storefrontLocaleDetect} =
    window.AVADA_SUBSCRIPTION?.translation || {};

  if (codEnabled || (translationEnabled && storefrontLocaleDetect === 'customerIp')) {
    await initGeo();
  }

  const BASE_URL = 'https://cdn-joy-sub.avada.io/scripttag';

  const domainCustom = ['velumashop.com'];

  const shouldLoadBoxScript = () => {
    const boxPagePath = '/pages/subscription-box';
    const currentPath = window.location.pathname;
    return currentPath.includes(boxPagePath);
  };

  const scripts = [
    {
      name: 'avada-subscription-main.min.js',
      condition: true
    },
    {
      name: 'avada-customer-portal-main.min.js',
      condition: window.location.pathname.includes(getCustomerPortalHref())
    },
    {
      name: 'avada-subscription-box-fixed-bundle-main.min.js',
      condition: window.location.pathname.includes('subscription-box')
    },
    {
      name: 'avada-cod-form-main.min.js',
      condition: codEnabled
    },
    {
      name: 'avada-subscription-box-main.min.js',
      condition: shouldLoadBoxScript() && !domainCustom.includes(window.location.hostname)
    },
    {
      name: 'avada-subscription-box-veluma-main.min.js',
      condition: shouldLoadBoxScript() && domainCustom.includes(window.location.hostname)
    }
  ];

  scripts
    .filter(s => s.condition)
    .forEach(script => {
      const scriptElement = document.createElement('script');
      scriptElement.type = 'text/javascript';
      scriptElement.async = !0;
      scriptElement.src = BASE_URL + `/${script.name}?v=${new Date().getTime()}`;
      const firstScript = document.getElementsByTagName('script')[0];
      firstScript.parentNode.insertBefore(scriptElement, firstScript);
    });
})();
