import { describe, expect, it } from 'vitest'
import {
  buildLexisXmlPreviewMessage,
  XML_PREVIEW_UNAVAILABLE,
} from '@/components/uploads/lexisXmlPreview'

const XML_PREVIEW_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<esf:ESFSubmission xmlns:esf="http://www.for.gov.bc.ca/schema/esf" xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis">
  <esf:submissionContent>
    <lexis:LexisSubmission>
      <lexis:applicant>
        <lexis:applicantDetails>
          <lexis:clientNumber>1074</lexis:clientNumber>
        </lexis:applicantDetails>
      </lexis:applicant>
      <lexis:applicationDetail>
        <lexis:bcForestRegionCode>RSC</lexis:bcForestRegionCode>
      </lexis:applicationDetail>
      <lexis:productDetail>
        <lexis:boomNumber>TEST23-652-7D-2</lexis:boomNumber>
        <lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>
        <lexis:harvestedTimber />
        <lexis:harvestedTimber />
      </lexis:productDetail>
    </lexis:LexisSubmission>
  </esf:submissionContent>
</esf:ESFSubmission>`

describe('lexisXmlPreview', () => {
  it('summarizes useful fields from a LEXIS XML submission', async () => {
    await expect(
      buildLexisXmlPreviewMessage(
        new File([XML_PREVIEW_FIXTURE], 'submission.xml', { type: 'application/xml' }),
      ),
    ).resolves.toBe(
      'Preview: Package TEST23-652-7D-2, Region RSC, Species/end use HE/PL, Client 1074, 2 scale rows.',
    )
  })

  it('omits preview values that contain nested markup', async () => {
    const xmlWithMarkupInPreviewField = XML_PREVIEW_FIXTURE.replace(
      '<lexis:boomNumber>TEST23-652-7D-2</lexis:boomNumber>',
      '<lexis:boomNumber><script>alert(1)</script></lexis:boomNumber>',
    )

    await expect(
      buildLexisXmlPreviewMessage(
        new File([xmlWithMarkupInPreviewField], 'submission.xml', { type: 'application/xml' }),
      ),
    ).resolves.toBe('Preview: Region RSC, Species/end use HE/PL, Client 1074, 2 scale rows.')
  })

  it('omits preview values that contain escaped markup text', async () => {
    const xmlWithEscapedMarkupInPreviewField = XML_PREVIEW_FIXTURE.replace(
      '<lexis:boomNumber>TEST23-652-7D-2</lexis:boomNumber>',
      '<lexis:boomNumber>&lt;script&gt;alert(1)&lt;/script&gt;</lexis:boomNumber>',
    )

    await expect(
      buildLexisXmlPreviewMessage(
        new File([xmlWithEscapedMarkupInPreviewField], 'submission.xml', {
          type: 'application/xml',
        }),
      ),
    ).resolves.toBe('Preview: Region RSC, Species/end use HE/PL, Client 1074, 2 scale rows.')
  })

  it('describes ZIP uploads without reading archive content client-side', async () => {
    await expect(
      buildLexisXmlPreviewMessage(new File(['zip-data'], 'submission.zip')),
    ).resolves.toBe('ZIP archive will be unpacked and validated on upload.')
  })

  it('falls back when required XML structure is missing', async () => {
    await expect(
      buildLexisXmlPreviewMessage(new File(['<xml />'], 'submission.xml')),
    ).resolves.toBe(XML_PREVIEW_UNAVAILABLE)
  })
})
