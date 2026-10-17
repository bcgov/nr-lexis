import type { ShippingReferenceOptions } from '@/service/shipping-reference-service'

type ShippingDefaultFields = {
  destinationCountry: string
  transportType: string
  portOfExport: string
}

const defaultCode = (options: { code: string }[], preferredCode: string): string =>
  options.find(({ code }) => code === preferredCode)?.code ?? options[0]?.code ?? ''

/**
 * Starts an empty country, transport type and port of export on United States of America, Barge
 * and Cowichan Bay (or the first option when one isn't offered). Values already set are kept, and
 * so is the port when it can't be changed.
 */
export const withShippingDefaults = <T extends ShippingDefaultFields>(
  form: T,
  options: ShippingReferenceOptions,
  { portLocked = false }: { portLocked?: boolean } = {},
): T => ({
  ...form,
  destinationCountry: form.destinationCountry || defaultCode(options.countries, 'US'),
  transportType: form.transportType || defaultCode(options.transportTypes, 'B'),
  portOfExport: form.portOfExport || (portLocked ? '' : defaultCode(options.ports, 'CB')),
})
