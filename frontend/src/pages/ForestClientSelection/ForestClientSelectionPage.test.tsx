import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ForestClientSelectionPage from '.'
import { AuthContext } from '@/context/auth/AuthContext'
import ThemeProvider from '@/context/theme/ThemeProvider'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

describe('ForestClientSelectionPage', () => {
  it('requires the user to choose one of the assigned organizations', async () => {
    const selectForestClient = vi.fn().mockResolvedValue(undefined)
    const onSelected = vi.fn()

    render(
      <AuthContext
        value={createTestAuthContext({
          capabilities: createTestCapabilities({
            principal: 'bceid\\multi-client-user',
            roles: ['PROVINCIAL_SUBMITTER'],
            forestClientNumber: null,
            availableForestClientNumbers: ['00012345', '00067890'],
            forestClientSelectionRequired: true,
          }),
          selectForestClient,
        })}
      >
        <ThemeProvider>
          <ForestClientSelectionPage onSelected={onSelected} />
        </ThemeProvider>
      </AuthContext>,
    )

    expect(screen.getByRole('heading', { name: 'Select an organization' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open LEXIS' })).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Organization'), '00067890')
    await userEvent.click(screen.getByRole('button', { name: 'Open LEXIS' }))

    await waitFor(() => {
      expect(selectForestClient).toHaveBeenCalledWith('00067890')
      expect(onSelected).toHaveBeenCalledOnce()
    })
  })

  it('allows the user to sign out without selecting an organization', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)

    render(
      <AuthContext
        value={createTestAuthContext({
          capabilities: createTestCapabilities({
            forestClientNumber: null,
            availableForestClientNumbers: ['00012345', '00067890'],
            forestClientSelectionRequired: true,
          }),
          logout,
        })}
      >
        <ThemeProvider>
          <ForestClientSelectionPage />
        </ThemeProvider>
      </AuthContext>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(logout).toHaveBeenCalledOnce()
  })
})
