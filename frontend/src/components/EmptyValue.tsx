/** An empty read-only value: an em dash, announced to screen readers as "Not provided". */
const EmptyValue = () => (
  <>
    <span aria-hidden="true">—</span>
    <span className="cds--visually-hidden">Not provided</span>
  </>
)

export default EmptyValue
