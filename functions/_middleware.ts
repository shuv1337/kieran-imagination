// Middleware to inject Hot or Not meta tags for /hot and /hotornot routes
export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Only process /hot and /hotornot routes
  if (path !== '/hot' && path !== '/hotornot') {
    return context.next();
  }

  // Fetch the index.html directly (since /hot and /hotornot don't exist as static files)
  const indexUrl = new URL('/index.html', url.origin);
  const response = await context.env.ASSETS.fetch(indexUrl);

  // Only modify HTML responses
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();

  // Custom meta tags for /hot page
  const hotMeta = {
    title: 'HOT or NOT? | Coloring Page Rankings',
    description: 'Vote on AI-generated coloring pages! Rate them HOT or NOT and see which creations rise to the top.',
    image: 'https://kieran.app/hot-share-banner.png',
  };

  // Replace title
  html = html.replace(
    /<title>.*?<\/title>/,
    `<title>${hotMeta.title}</title>`
  );

  // Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${hotMeta.description}"`
  );

  // Replace OG tags
  html = html.replace(
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${hotMeta.title}"`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${hotMeta.description}"`
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*"/,
    `<meta property="og:image" content="${hotMeta.image}"`
  );

  // Replace Twitter tags
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"/,
    `<meta name="twitter:title" content="${hotMeta.title}"`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"/,
    `<meta name="twitter:description" content="${hotMeta.description}"`
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*"/,
    `<meta name="twitter:image" content="${hotMeta.image}"`
  );

  // Create new response with modified HTML
  const newHeaders = new Headers(response.headers);
  return new Response(html, {
    status: response.status,
    headers: newHeaders,
  });
};
