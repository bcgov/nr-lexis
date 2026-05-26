import type { FC } from 'react'
import type { AxiosResponse } from 'axios'
import type UserDto from '@/interfaces/UserDto'
import { useEffect, useState } from 'react'
import {
  Button,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react'
import apiService from '@/service/api-service'

type ModalProps = {
  show: boolean
  onHide: () => void
  user?: UserDto
}

const ModalComponent: FC<ModalProps> = ({ show, onHide, user }) => {
  return (
    <Modal
      open={show}
      passiveModal
      modalHeading="Row Details"
      onRequestClose={onHide}
      onRequestSubmit={onHide}
    >
      <pre className="user-details-json">{JSON.stringify(user, null, 2)}</pre>
    </Modal>
  )
}

const Dashboard: FC = () => {
  const [data, setData] = useState<any>([])
  const [selectedUser, setSelectedUser] = useState<UserDto | undefined>(undefined)

  useEffect(() => {
    apiService
      .getAxiosInstance()
      .get('/v1/users')
      .then((response: AxiosResponse) => {
        const users: UserDto[] = []
        for (const user of response.data) {
          const userDto = {
            id: user.id,
            name: user.name,
            email: user.email,
          }
          users.push(userDto)
        }
        setData(users)
      })
      .catch((error) => {
        console.error(error)
      })
  }, [])

  const handleClose = () => {
    setSelectedUser(undefined)
  }

  return (
    <div className="dashboard-page">
      <h2 className="dashboard-title">Users</h2>
      <Table aria-label="Users table" useZebraStyles>
        <TableHead>
          <TableRow>
            <TableHeader>Employee ID</TableHeader>
            <TableHeader>Employee Name</TableHeader>
            <TableHeader>Employee Email</TableHeader>
            <TableHeader />
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((user: UserDto) => (
            <TableRow key={user.id}>
              <TableCell>{user.id}</TableCell>
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Button kind="secondary" size="sm" onClick={() => setSelectedUser(user)}>
                  View Details
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ModalComponent show={!!selectedUser} onHide={handleClose} user={selectedUser} />
    </div>
  )
}

export default Dashboard
