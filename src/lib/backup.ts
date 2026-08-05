import type { Dataset } from './types'

/**
 * Password-encrypted full-database backup for PropertyLedger.
 *
 * File layout (binary): MAGIC + VERSION(1) + SALT(16) + IV(12) + ciphertext.
 * The ciphertext is an AES-256-GCM encryption of the JSON BackupEnvelope, so
 * the file is unreadable without the password and self-describing after
 * decryption. Works in any modern browser (WebCrypto, requires HTTPS — which
 * the deployed site and localhost both provide).
 */

export const BACKUP_MAGIC = 'PROPERTYLEDGER-BACKUP'
export const BACKUP_VERSION = 1

interface BackupEnvelope {
  format: 'propertyledger-backup'
  version: number
  createdAt: string
  dataset: Dataset
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypts a full dataset into a downloadable, password-protected blob. */
export async function encryptBackup(dataset: Dataset, password: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)

  const envelope: BackupEnvelope = {
    format: 'propertyledger-backup',
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    dataset,
  }
  const plaintext = encoder.encode(JSON.stringify(envelope))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)

  return new Blob(
    [encoder.encode(BACKUP_MAGIC), new Uint8Array([BACKUP_VERSION]), salt, iv, ciphertext],
    { type: 'application/octet-stream' },
  )
}

/** Decrypts a backup blob. Throws a friendly Error on wrong password or corrupt data. */
export async function decryptBackup(blob: Blob, password: string): Promise<Dataset> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  const magic = encoder.encode(BACKUP_MAGIC)
  const minLength = magic.length + 1 + 16 + 12
  if (buf.length < minLength) throw new Error('This file is not a PropertyLedger backup.')

  for (let i = 0; i < magic.length; i++) {
    if (buf[i] !== magic[i]) throw new Error('This file is not a PropertyLedger backup.')
  }

  const version = buf[magic.length]
  if (version !== BACKUP_VERSION) {
    throw new Error(`This backup was created by an unsupported version (${version}).`)
  }

  let off = magic.length + 1
  const salt = buf.subarray(off, off + 16)
  off += 16
  const iv = buf.subarray(off, off + 12)
  off += 12
  const ciphertext = buf.subarray(off)

  const key = await deriveKey(password, salt)
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  } catch {
    throw new Error('Incorrect password or corrupted file.')
  }

  let envelope: BackupEnvelope
  try {
    envelope = JSON.parse(decoder.decode(plaintext)) as BackupEnvelope
  } catch {
    throw new Error('The backup data could not be read.')
  }
  if (envelope.format !== 'propertyledger-backup' || envelope.version !== BACKUP_VERSION) {
    throw new Error('This file is not a valid PropertyLedger backup.')
  }
  return envelope.dataset
}
