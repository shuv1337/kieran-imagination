// Middleware to inject Hot or Not meta tags for /hot route
export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  
  // Only modify HTML responses
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();

  // Replace meta tags for /hot page
  const hotMeta = {
    title: 'HOT or NOT? | Coloring Page Rankings',
    description: 'Vote on AI-generated coloring pages! Rate them HOT or NOT and see which creations rise to the top.',
    image: '/hot-share-banner.png',
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

  return new Response(html, {
    status: response.status,
    headers: response.headers,
  });
};
