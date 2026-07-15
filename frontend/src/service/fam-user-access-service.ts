import apiService from '@/service/api-service'

export type FamUserRoleAssignment = {
  assignmentId: number | null
  userId: number | null
  userName: string | null
  userTypeCode: string | null
  userTypeDescription: string | null
  firstName: string | null
  lastName: string | null
  fullName: string | null
  email: string | null
  roleId: number | null
  roleName: string | null
  roleDisplayName: string | null
  roleTypeCode: string | null
  forestClientNumber: string | null
  forestClientName: string | null
  forestClientStatusCode: string | null
  forestClientStatusDescription: string | null
  scopeType: string | null
  scopeValue: string | null
  createDate: string | null
  expiryDate: string | null
}

export type FamUserRoleAssignmentSearchResponse = {
  results: FamUserRoleAssignment[]
  total: number
  pageNumber: number
  pageSize: number
  pageCount: number
  configured: boolean
  message: string | null
}

export type FamUserRoleAssignmentSearchParams = {
  search?: string
  pageNumber?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export const searchFamUserRoleAssignments = async (
  params: FamUserRoleAssignmentSearchParams,
): Promise<FamUserRoleAssignmentSearchResponse> => {
  const response = await apiService
    .getAxiosInstance()
    .get<FamUserRoleAssignmentSearchResponse>('/lexis/admin/fam-users', {
      params: {
        search: params.search,
        pageNumber: params.pageNumber,
        pageSize: params.pageSize,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      },
    })
  return response.data
}
