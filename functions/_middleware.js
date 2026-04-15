export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Block junk product URLs: capitalized slug with trailing number ID
  const junkPattern = /\/[A-Z][A-Za-z0-9\-]+-\d+\/$/;

  if (junkPattern.test(path)) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" }
    });
  }

  return context.next();
}
