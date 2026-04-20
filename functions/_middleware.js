export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Block junk product URLs: capitalized slug with trailing number ID
  const junkPattern = /\/[A-Z][A-Za-z0-9\-]+-\d+\/$/;

  // Block old WordPress tag archive URLs
  const tagPattern = /^\/tag\//;

  // Block old WebSphere Commerce URLs
  const webappPattern = /^\/webapp\//;

  if (junkPattern.test(path) || tagPattern.test(path) || webappPattern.test(path)) {
    return new Response(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Found</title>
</head>
<body>
  <h1>404 - Page Not Found</h1>
  <p>This page no longer exists.</p>
</body>
</html>`,
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      }
    );
  }

  return context.next();
}
