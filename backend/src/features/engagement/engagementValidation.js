// Keep user-submitted product questions, seller answers, and reviews within database limits.
export function validateQuestion(value) {
    if (typeof value !== "string") return null;
    const question = value.trim();
    return question.length >= 10 && question.length <= 500 ? question : null;
}

// Require a useful answer while limiting stored text and rendered page size.
export function validateAnswer(value) {
    if (typeof value !== "string") return null;
    const answer = value.trim();
    return answer.length >= 2 && answer.length <= 1000 ? answer : null;
}

// Accept integer star ratings and a short written community review.
export function validateReview(ratingValue, commentValue) {
    const rating = Number(ratingValue);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof commentValue !== "string") return null;
    const comment = commentValue.trim();
    if (comment.length < 3 || comment.length > 1000) return null;
    return { rating, comment };
}
