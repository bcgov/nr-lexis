// Swaps the personal details in a LEXIS API response for sample ones, so a screenshot taken in a
// real environment shows no real person, company or contact detail. Numbers, dates, statuses and
// code descriptions are left as the environment has them.

const SAMPLE_COMPANIES = [
  'Example Forestry Ltd.',
  'Sample Timber Co.',
  'Demo Log Exports Inc.',
  'Example Coastal Logging Ltd.',
  'Sample Inlet Sawmills Ltd.',
  'Demo Forest Products Inc.',
]
const SIGNED_IN_SAMPLE_USER = 'JSAMPLE'
const OTHER_SAMPLE_USER = 'PEXAMPLE'
const SAMPLE_PHONE_DIGITS = '2505550142'

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi
const DIRECTORY_USER = /\b(IDIR|BCEID)\\[A-Z0-9_.-]+/gi
const FORMATTED_PHONE = /\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/g

type Swap = (value: string, key: string) => string

const USER_ID = /^([A-Za-z]+\\)?(.*?)(@.*)?$/

const isAgentField = (key: string) => /^agent/i.test(key)

const sampleEmail: Swap = (_value, key) => {
  if (/regional|approval|copyTo/i.test(key)) return 'export.office@example.com'
  return isAgentField(key) ? 'pat.example@example.com' : 'jordan.sample@example.com'
}

/** Keeps the punctuation of a phone number and replaces its digits. */
const samplePhone: Swap = (value) => {
  let index = 0
  return value.replace(/\d/g, () => SAMPLE_PHONE_DIGITS[index++ % SAMPLE_PHONE_DIGITS.length])
}

const sampleFreeText = (value: string) =>
  value
    .replace(EMAIL, 'name@example.com')
    .replace(DIRECTORY_USER, `$1\\${OTHER_SAMPLE_USER}`)
    .replace(FORMATTED_PHONE, '250-555-0142')

/** One swap per screenshot run, so a client or user reads the same on every screen. */
export const createSampleDetailSwap = () => {
  const companies = new Map<string, string>()
  let signedInUser = ''

  const sampleCompany: Swap = (value) => {
    const name = value.trim().toUpperCase()
    if (!companies.has(name)) {
      companies.set(name, SAMPLE_COMPANIES[companies.size % SAMPLE_COMPANIES.length])
    }
    return companies.get(name) ?? SAMPLE_COMPANIES[0]
  }

  /** Keeps the `IDIR\` or `@idir` part of a user id and replaces the name. */
  const sampleUser: Swap = (value, key) => {
    const [, directory = '', name = '', realm = ''] = value.match(USER_ID) ?? []
    if (key === 'principal') signedInUser = name.toUpperCase()
    const sample = name.toUpperCase() === signedInUser ? SIGNED_IN_SAMPLE_USER : OTHER_SAMPLE_USER
    return `${directory}${sample}${realm}`
  }

  // First match wins.
  const fieldSwaps: [RegExp, Swap][] = [
    [/email/i, sampleEmail],
    [/^(phone|fax)$|(Phone|Fax)(Number)?$/, samplePhone],
    [/contactName$/i, (_value, key) => (isAgentField(key) ? 'Pat Example' : 'Jordan Sample')],
    [/^clientAcronym$/, () => 'SAMPLE'],
    [/^locationName$/, () => 'Head office'],
    [/(company|client)Name$/i, sampleCompany],
    [
      /^(principal|author|lockedBy|updatedBy|savedBy|user|createUser|remarkUser|exemptionApprover)$|userId$/i,
      sampleUser,
    ],
    [/^(address|street)$|^addressLine\d?$/i, () => '100 Example Street'],
    [/^postalCode$/, () => 'V0V 0V0'],
    [/^(pickup|product|log)Location$/, () => 'Boom ground at Sample Inlet'],
    [
      /^(offerCondition|otherConditions)$/,
      () => 'Logs to be towed by the buyer within 30 days of approval.',
    ],
    [
      /^(remarks?|remarkBody|comments|offerRemark|withdrawReason|overrideComment|permitRemarks|initialRemark|storedComment|manufacturingFacilityInfo)$/,
      () => 'Sample remark.',
    ],
  ]

  // Notices are written by whoever is testing; show neutral ones.
  const noticeSwaps: [RegExp, Swap][] = [
    [/^title$/, () => 'Sample notice'],
    [/^contentHtml$/, () => '<p>Sample notice text.</p>'],
  ]

  const swapValue = (value: unknown, key: string, swaps: [RegExp, Swap][]): unknown => {
    if (Array.isArray(value)) return value.map((item) => swapValue(item, key, swaps))
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([field, fieldValue]) => [
          field,
          swapValue(fieldValue, field, swaps),
        ]),
      )
    }
    if (typeof value !== 'string' || !value.trim()) return value
    const swap = swaps.find(([pattern]) => pattern.test(key))?.[1]
    return swap ? swap(value, key) : sampleFreeText(value)
  }

  return (pathname: string, payload: unknown): unknown =>
    swapValue(
      payload,
      '',
      /\/notifications\b/.test(pathname) ? [...noticeSwaps, ...fieldSwaps] : fieldSwaps,
    )
}
