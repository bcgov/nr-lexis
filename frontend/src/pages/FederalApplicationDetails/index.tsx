import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Tile,
} from '@carbon/react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import { AppNotification } from '../../components/AppNotification'
import DetailDocumentUploadPanel from '../../components/uploads/DetailDocumentUploadPanel'
import type { FederalApplicationDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '../shared/DetailSections'
import { displayValue } from '@/pages/shared/detail-page-utils'
import { appendSearchParamsToPath } from '@/pages/shared/search-query-utils'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { fetchFederalApplicationDetail } from '@/service/lexis-detail-service'
import {
  fetchFederalApplicationDocuments,
  openFederalApplicationDocument,
  removeFederalApplicationDocument,
  type FederalApplicationDocumentRow,
} from '@/service/federal-application-documents-service'
import { triggerBrowserDownload } from '@/utils/download'

const FederalApplicationDetailsPage = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { applicationNumber } = useParams()
  const [searchParams] = useSearchParams()
  const [detail, setDetail] = useState<FederalApplicationDetail | null>(null)
  const [documentRows, setDocumentRows] = useState<FederalApplicationDocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [selectedFederalApplicationTabIndex, setSelectedFederalApplicationTabIndex] = useState(0)
  const beginDetailRequest = useLatestRequestGuard()

  const canManageDocuments = canPerform('/fileApplicationUpload')
  const hasAgent =
    !!detail?.agentClientNumber ||
    !!detail?.agentClientLocationCode ||
    !!detail?.agentApplicantType ||
    !!detail?.agentContactName ||
    !!detail?.agentCompanyName

  const withCurrentSearch = useCallback(
    (path: string): string => appendSearchParamsToPath(path, searchParams),
    [searchParams],
  )

  useEffect(() => {
    const load = async () => {
      const isLatestRequest = beginDetailRequest()
      if (!applicationNumber) {
        setErrorMessage('Application number is missing from the route.')
        setDetail(null)
        setDocumentRows([])
        setDocumentsErrorMessage('')
        setActionErrorMessage('')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      setDocumentsErrorMessage('')
      setActionErrorMessage('')
      try {
        const response = await fetchFederalApplicationDetail(applicationNumber)
        if (!isLatestRequest()) {
          return
        }
        setDetail(response)
        if (!response) {
          setErrorMessage(`No federal application found for ${applicationNumber}.`)
          setDocumentRows([])
          return
        }

        try {
          const documentsResult = await fetchFederalApplicationDocuments(applicationNumber)
          if (isLatestRequest()) {
            setDocumentRows(documentsResult.rows)
          }
        } catch (error) {
          if (isLatestRequest()) {
            console.error(error)
            setDocumentRows([])
            setDocumentsErrorMessage('Unable to retrieve federal application documents.')
          }
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve federal application detail.')
          setDetail(null)
          setDocumentRows([])
          setDocumentsErrorMessage('')
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    }

    void load()
  }, [applicationNumber, beginDetailRequest])

  const refreshFederalApplicationDocuments = useCallback(async () => {
    if (!applicationNumber) {
      return
    }

    const documentsResult = await fetchFederalApplicationDocuments(applicationNumber)
    setDocumentRows(documentsResult.rows)
    setDocumentsErrorMessage('')
  }, [applicationNumber])

  const onOpenDocument = useCallback(async (row: FederalApplicationDocumentRow) => {
    setActionErrorMessage('')

    try {
      const result = await openFederalApplicationDocument(row.id, row.name)
      triggerBrowserDownload(result.blob, result.filename || row.name)
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to open the selected document.')
    }
  }, [])

  const onRemoveDocument = useCallback(
    async (row: FederalApplicationDocumentRow) => {
      if (!applicationNumber) {
        return
      }

      const isLatestRequest = beginDetailRequest()
      setIsRemovingDocumentId(row.id)
      setActionErrorMessage('')

      try {
        const removeResult = await removeFederalApplicationDocument(row.id, applicationNumber)
        if (!isLatestRequest()) {
          return
        }
        if (!removeResult.success) {
          setActionErrorMessage('Document removal failed. Refresh and try again.')
          return
        }

        const documentsResult = await fetchFederalApplicationDocuments(applicationNumber)
        if (isLatestRequest()) {
          setDocumentRows(documentsResult.rows)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setActionErrorMessage('Unable to remove the selected document.')
        }
      } finally {
        if (isLatestRequest()) {
          setIsRemovingDocumentId(null)
        }
      }
    },
    [applicationNumber, beginDetailRequest],
  )

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <h1>Federal application details</h1>
        <p>
          Federal application <code>{applicationNumber}</code>
        </p>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading federal application detail..." />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <AppNotification
            kind="error"
            title="Detail unavailable"
            subtitle={errorMessage}
            lowContrast
            onCloseButtonClick={() => setErrorMessage('')}
          />
        </Column>
      )}

      {!loading && detail && (
        <>
          {!!documentsErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="warning"
                title="Documents unavailable"
                subtitle={documentsErrorMessage}
                lowContrast
                onCloseButtonClick={() => setDocumentsErrorMessage('')}
              />
            </Column>
          )}
          {!!actionErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="error"
                title="Action failed"
                subtitle={actionErrorMessage}
                lowContrast
                onCloseButtonClick={() => setActionErrorMessage('')}
              />
            </Column>
          )}

          <Column sm={4} md={8} lg={16} className="application-detail-tabs-column">
            <Tabs
              selectedIndex={selectedFederalApplicationTabIndex}
              onChange={({ selectedIndex }) => setSelectedFederalApplicationTabIndex(selectedIndex)}
            >
              <TabList
                aria-label="Federal application detail sections"
                contained
                size="md"
                className="application-tabs__list application-detail-tab-list"
              >
                <Tab>Owner</Tab>
                {hasAgent && <Tab>Agent</Tab>}
                <Tab>Application</Tab>
                <Tab>Items</Tab>
                <Tab>Offers</Tab>
                <Tab>Remarks</Tab>
                <Tab>Documents</Tab>
                <Tab>Shipping Details</Tab>
              </TabList>
              <TabPanels>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <DetailFieldTile
                        title="Owner"
                        fields={[
                          {
                            label: 'Client number',
                            value: displayValue(detail.ownerClientNumber),
                          },
                          {
                            label: 'Applicant type',
                            value: displayValue(detail.ownerApplicantType),
                          },
                          {
                            label: 'Client location',
                            value: displayValue(detail.ownerClientLocationCode),
                          },
                          {
                            label: 'Contact name',
                            value: displayValue(detail.ownerContactName),
                          },
                          {
                            label: 'Company name',
                            value: displayValue(detail.ownerCompanyName),
                          },
                        ]}
                      />
                    </Column>
                  </Grid>
                </TabPanel>

                {hasAgent && (
                  <TabPanel className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <DetailFieldTile
                          title="Agent"
                          fields={[
                            {
                              label: 'Client number',
                              value: displayValue(detail.agentClientNumber),
                            },
                            {
                              label: 'Applicant type',
                              value: displayValue(detail.agentApplicantType),
                            },
                            {
                              label: 'Client location',
                              value: displayValue(detail.agentClientLocationCode),
                            },
                            {
                              label: 'Contact name',
                              value: displayValue(detail.agentContactName),
                            },
                            {
                              label: 'Company name',
                              value: displayValue(detail.agentCompanyName),
                            },
                          ]}
                        />
                      </Column>
                    </Grid>
                  </TabPanel>
                )}

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <DetailFieldTile
                        title="Application"
                        fields={[
                          {
                            label: 'Region',
                            value: displayValue(detail.region),
                          },
                          {
                            label: 'Product type',
                            value: displayValue(detail.productType),
                          },
                          {
                            label: 'Application date',
                            value: displayValue(detail.applicationDate),
                          },
                          {
                            label: 'Date received',
                            value: displayValue(detail.receivedDate),
                          },
                          {
                            label: 'List date',
                            value: displayValue(detail.listingDate),
                          },
                          {
                            label: 'Application number',
                            value: displayValue(detail.federalApplicationNumber),
                          },
                          {
                            label: 'Status',
                            value: displayValue(detail.statusDescription ?? detail.statusCode),
                          },
                          {
                            label: 'Author',
                            value: displayValue(detail.author),
                          },
                          {
                            label: 'Exemption number',
                            value: displayValue(detail.exemptionNumber),
                          },
                          {
                            label: 'Exemption type',
                            value: displayValue(detail.exemptionType),
                          },
                          {
                            label: 'Exemption reason',
                            value: displayValue(detail.exemptionReason),
                          },
                          {
                            label: 'Term days',
                            value: displayValue(detail.termDays),
                          },
                        ]}
                      />
                    </Column>
                  </Grid>
                </TabPanel>

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <DetailFieldTile
                        title="Items"
                        fields={[
                          {
                            label: 'Location of logs',
                            value: displayValue(detail.logLocation),
                          },
                          {
                            label: 'Age class',
                            value: displayValue(detail.ageClass),
                          },
                          {
                            label: 'Average log volume',
                            value: displayValue(detail.averageLogVolume),
                          },
                          {
                            label: 'Application volume',
                            value: displayValue(detail.applicationVolume),
                          },
                          {
                            label: 'Species and end use sort',
                            value: displayValue(detail.endUse),
                          },
                        ]}
                      />
                    </Column>
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Packages</h2>
                        <Table useZebraStyles>
                          <TableHead>
                            <TableRow>
                              <TableHeader>Package number</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {detail.packages.map((item) => (
                              <TableRow key={item}>
                                <TableCell>{item}</TableCell>
                              </TableRow>
                            ))}
                            {detail.packages.length === 0 && (
                              <TableRow>
                                <TableCell>No packages found.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Offers</h2>
                        <Table useZebraStyles>
                          <TableHead>
                            <TableRow>
                              <TableHeader>Offer reference</TableHeader>
                              <TableHeader>Open</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {detail.offers.map((item) => (
                              <TableRow key={item}>
                                <TableCell>{item}</TableCell>
                                <TableCell>
                                  <Button
                                    kind="ghost"
                                    size="sm"
                                    disabled={
                                      !canPerform('/offersSearch') || !canPerform('/offerDetails')
                                    }
                                    onClick={() =>
                                      navigate(
                                        withCurrentSearch(
                                          `/provincial/offers/${encodeURIComponent(item)}`,
                                        ),
                                      )
                                    }
                                  >
                                    Open
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            {detail.offers.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={2}>No offers found.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Remarks</h2>
                        <Table useZebraStyles>
                          <TableHead>
                            <TableRow>
                              <TableHeader>Remark</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {detail.remarks.map((item) => (
                              <TableRow key={item}>
                                <TableCell>{item}</TableCell>
                              </TableRow>
                            ))}
                            {detail.remarks.length === 0 && (
                              <TableRow>
                                <TableCell>No remarks found.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Documents</h2>
                        {canManageDocuments && (
                          <DetailDocumentUploadPanel
                            workflowType="application"
                            targetNumber={String(
                              detail.applicationNumber ?? applicationNumber ?? '',
                            )}
                            inputId="federalApplicationDocumentUpload"
                            disabled={!detail.applicationNumber && !applicationNumber}
                            onUploadComplete={refreshFederalApplicationDocuments}
                          />
                        )}
                        <Table useZebraStyles>
                          <TableHead>
                            <TableRow>
                              <TableHeader>File Name</TableHeader>
                              <TableHeader>Description</TableHeader>
                              <TableHeader>Type</TableHeader>
                              <TableHeader>Actions</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {documentRows.map((row) => (
                              <TableRow key={row.id}>
                                <TableCell>{row.name || '-'}</TableCell>
                                <TableCell>{row.description || '-'}</TableCell>
                                <TableCell>{row.type || '-'}</TableCell>
                                <TableCell>
                                  <div className="legacy-search-actions">
                                    <Button
                                      kind="ghost"
                                      size="sm"
                                      onClick={() => void onOpenDocument(row)}
                                    >
                                      Open
                                    </Button>
                                    <Button
                                      kind="danger--ghost"
                                      size="sm"
                                      disabled={
                                        !canManageDocuments || isRemovingDocumentId === row.id
                                      }
                                      onClick={() => void onRemoveDocument(row)}
                                    >
                                      {isRemovingDocumentId === row.id ? 'Deleting...' : 'Delete'}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                            {documentRows.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={4}>No documents found.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <DetailFieldTile
                        title="Shipping details"
                        fields={[
                          {
                            label: 'Permit issue date',
                            value: displayValue(detail.federalPermit?.permitIssueDate),
                          },
                          {
                            label: 'Final destination country',
                            value: displayValue(detail.federalPermit?.destinationCountry),
                          },
                          {
                            label: 'Transport type',
                            value: displayValue(detail.federalPermit?.transportType),
                          },
                          {
                            label: 'Transport name',
                            value: displayValue(detail.federalPermit?.transportName),
                          },
                          {
                            label: 'Estimated shipping date',
                            value: displayValue(detail.federalPermit?.shippingDate),
                          },
                          {
                            label: 'Customs port of export',
                            value: displayValue(detail.federalPermit?.portOfExport),
                          },
                          {
                            label: 'Other port of export',
                            value: displayValue(detail.federalPermit?.otherPortOfExport),
                          },
                          {
                            label: 'Permit number',
                            value: displayValue(detail.federalPermit?.permitNumber),
                          },
                        ]}
                      />
                    </Column>
                  </Grid>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Column>
        </>
      )}
    </Grid>
  )
}

export default FederalApplicationDetailsPage
