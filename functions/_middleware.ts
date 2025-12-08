// Middleware to inject custom meta tags for special routes (/hot, /hotornot, /cards)

interface RouteMeta {
  title: string;
  description: string;
  image: string;
}

const ROUTE_META: Record<string, RouteMeta> = {
  '/hot': {
    title: 'HOT or NOT? | Coloring Page Rankings',
    description: 'Vote on AI-generated coloring pages! Rate them HOT or NOT and see which creations rise to the top.',
    image: 'https://kieran.app/hot-share-banner.png',
  },
  '/hotornot': {
    title: 'HOT or NOT? | Coloring Page Rankings',
    description: 'Vote on AI-generated coloring pages! Rate them HOT or NOT and see which creations rise to the top.',
    image: 'https://kieran.app/hot-share-banner.png',
  },
  '/cards': {
    title: "Trading Card Generator | Kieran's Imagination",
    description: 'Create custom trading cards with AI! Design your own creature cards with different rarities and themes.',
    image: 'https://kieran.app/cards-share-banner.png',
  },
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Only process routes that need custom meta tags
  const meta = ROUTE_META[path];
  if (!meta) {
    return context.next();
  }

  // Fetch the index.html directly (since these routes don't exist as static files)
  const indexUrl = new URL('/index.html', url.origin);
  const response = await context.env.ASSETS.fetch(indexUrl);

  // Only modify HTML responses
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();

  // Replace title
  html = html.replace(
    /<title>.*?<\/title>/,
    `<title>${meta.title}</title>`
  );

  // Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${meta.description}"`
  );

  // Replace OG tags
  html = html.replace(
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${meta.title}"`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${meta.description}"`
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*"/,
    `<meta property="og:image" content="${meta.image}"`
  );

  // Replace Twitter tags
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"/,
    `<meta name="twitter:title" content="${meta.title}"`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"/,
    `<meta name="twitter:description" content="${meta.description}"`
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*"/,
    `<meta name="twitter:image" content="${meta.image}"`
  );

  // Create new response with modified HTML
  const newHeaders = new Headers(response.headers);
  return new Response(html, {
    status: response.status,
    headers: newHeaders,
  });
};
