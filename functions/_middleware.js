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
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" }
    });
  }

  return context.next();
}
