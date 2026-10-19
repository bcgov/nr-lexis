/** The longest application remark that can be stored, counted as stored. */
const STORED_REMARK_MAX_LENGTH = 250

/** A remark's stored length: &, < and > are saved as &amp;, &lt; and &gt;. */
export const storedRemarkLength = (remark: string): number =>
  remark.length + (remark.match(/&/g)?.length ?? 0) * 4 + (remark.match(/[<>]/g)?.length ?? 0) * 3

/** The error for a remark that is too long once stored, or null when it fits. */
export const storedRemarkLengthError = (remark: string): string | null =>
  storedRemarkLength(remark) > STORED_REMARK_MAX_LENGTH
    ? `Remark must not exceed ${STORED_REMARK_MAX_LENGTH} characters once saved. Each & counts as 5 characters, and each < or > as 4.`
    : null
