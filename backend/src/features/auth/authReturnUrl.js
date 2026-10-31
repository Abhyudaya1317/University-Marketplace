// Accept only safe relative application paths for the post-login redirect.
export function normalizeFrontendReturnUrl(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }

  try {
    const baseUrl = new URL("http://campusx.local");
    const destination = new URL(value, baseUrl);
    if (
      destination.origin !== baseUrl.origin ||
      destination.pathname.startsWith("/auth")
    ) {
      return "/";
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}
