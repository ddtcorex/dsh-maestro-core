/**
 * Shared between the Settings card and the host endpoint names. The granular
 * dsh-maestro-review settings-rpc row implements this exact surface on the
 * canonical channel.
 */
export const MAESTRO_RPC_CHANNEL = '/dsh-maestro-review'

export const MAESTRO_ENDPOINTS = Object.freeze({
  status: 'maestro.status',
  getConfig: 'maestro.getConfig',
  saveConfig: 'maestro.saveConfig',
  tunnelStart: 'maestro.tunnelStart',
  tunnelStop: 'maestro.tunnelStop',
  proxyStatus: 'maestro.proxyStatus',
  getPin: 'maestro.getPin',
  rotatePin: 'maestro.rotatePin',
  lanPinStatus: 'maestro.lanPin.status',
  lanPinSetEnabled: 'maestro.lanPin.setEnabled',
  lanPinRotate: 'maestro.lanPin.rotate',
  reviewsList: 'maestro.reviews.list',
  modelsList: 'maestro.models.list',
  modelsCurrent: 'maestro.models.current',
})
