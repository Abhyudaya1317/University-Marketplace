// Turn names into lowercase, lightly cleaned words so spelling variations can match.
export function productKeywords(value: string): string[] {
  return value
    .toLocaleLowerCase('en')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/(.)\1{2,}/gu, '$1$1')
    .split(/\s+/)
    .filter(Boolean)
}

// Match complete words, prefixes, and a small spelling difference in longer words.
export function keywordsMatch(first: string, second: string): boolean {
  if (first === second) return true;
  if (Math.min(first.length, second.length) >= 3 && (first.startsWith(second) || second.startsWith(first))) return true;
  return Math.min(first.length, second.length) >= 5 && editDistance(first, second) <= 1;
}

// Treat titles as the same product when at least one useful keyword matches.
export function productNamesMatch(firstName: string, secondName: string): boolean {
  const firstWords = productKeywords(firstName);
  const secondWords = new Set(productKeywords(secondName));
  return firstWords.some((word) => [...secondWords].some((candidate) => keywordsMatch(word, candidate)));
}

// Keep results relevant: every typed word must match a product word or close spelling.
export function productMatchesSearch(productName: string, searchText: string): boolean {
  const searchWords = productKeywords(searchText);
  const productWords = productKeywords(productName);
  return searchWords.every((searchWord) => productWords.some((productWord) => keywordsMatch(searchWord, productWord)));
}

// Compare longer product words without adding a package; stop once more than one edit is needed.
function editDistance(first: string, second: string): number {
  if (Math.abs(first.length - second.length) > 1) return 2;
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex];
    let rowMinimum = firstIndex;
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const cost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + cost
      );
      rowMinimum = Math.min(rowMinimum, current[secondIndex]);
    }
    if (rowMinimum > 1) return 2;
    previous = current;
  }

  return previous[second.length];
}
