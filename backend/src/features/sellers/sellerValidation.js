// Accept only positive decimal account IDs from seller profile URLs.
export function parseSellerId(value) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
    const sellerId = Number(value);
    return Number.isSafeInteger(sellerId) && sellerId > 0 ? sellerId : null;
}
