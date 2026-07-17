import { beforeEach, describe, expect, it, vi } from 'vitest'
import { removeApplicationDocument } from '@/service/provincial-application-documents-service'
import { removeExemptionDocument } from '@/service/provincial-exemption-documents-service'
import {
  removePermitApplicationDocument,
  removePermitDocument,
  removePermitInvoiceDocument,
} from '@/service/provincial-permit-documents-invoices-service'

const { deleteMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      delete: deleteMock,
    }),
  },
}))

type RemovalResult = { success: boolean; source: 'api' }
type RemovalCase = {
  name: string
  path: string
  targetParam: string
  remove: (documentId: string, target: string) => Promise<RemovalResult>
}

const removalCases: RemovalCase[] = [
  {
    name: 'application',
    path: '/lexis/rpc/application-details/document',
    targetParam: 'applicationNumber',
    remove: removeApplicationDocument,
  },
  {
    name: 'exemption',
    path: '/lexis/rpc/exemption-details/document',
    targetParam: 'exemptionNumber',
    remove: removeExemptionDocument,
  },
  {
    name: 'permit',
    path: '/lexis/rpc/permit-details/document/permit',
    targetParam: 'permitNumber',
    remove: removePermitDocument,
  },
  {
    name: 'permit application',
    path: '/lexis/rpc/permit-details/document/application',
    targetParam: 'permitNumber',
    remove: removePermitApplicationDocument,
  },
  {
    name: 'permit invoice',
    path: '/lexis/rpc/permit-details/document/invoice',
    targetParam: 'permitNumber',
    remove: removePermitInvoiceDocument,
  },
]

describe('document removal service contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(removalCases)('accepts an explicit $name document removal success', async (testCase) => {
    deleteMock.mockResolvedValue({ status: 200, data: { success: 'true' } })

    await expect(testCase.remove(' 55 ', ' TARGET-1 ')).resolves.toEqual({
      success: true,
      source: 'api',
    })
    expect(deleteMock).toHaveBeenCalledWith(testCase.path, {
      params: {
        documentId: '55',
        [testCase.targetParam]: 'TARGET-1',
      },
    })
  })

  it.each(removalCases)(
    'rejects unavailable $name document removal instead of treating 204 as success',
    async (testCase) => {
      deleteMock.mockResolvedValue({ status: 204, data: undefined })

      await expect(testCase.remove('55', 'TARGET-1')).rejects.toThrow('document removal response')
    },
  )
})
