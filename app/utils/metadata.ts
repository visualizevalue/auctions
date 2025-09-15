import { Address, PublicClient, getContract } from 'viem'

// Types for metadata
interface TokenMetadata {
  name?: string
  description?: string
  image?: string
  attributes?: Array<{
    trait_type: string
    value: string | number
  }>
  [key: string]: any // Allow for additional properties
}

// Gateway URLs
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/'
const ARWEAVE_GATEWAY = 'https://arweave.net/'

/**
 * Resolves various URI schemes to HTTP URLs
 */
export const resolveURI = async (
  uri: string,
  config = { ipfs: IPFS_GATEWAY, ar: ARWEAVE_GATEWAY }
): Promise<string> => {
  const { ipfs, ar } = config

  if (!uri) return ''

  // Handle base64 encoded data URIs
  if (uri.startsWith('data:')) {
    return uri
  }

  // Handle IPFS URIs
  if (uri.startsWith('ipfs://')) {
    return ipfs + uri.replace('ipfs://', '')
  }

  // Handle Arweave URIs
  if (uri.startsWith('ar://')) {
    return ar + uri.replace('ar://', '')
  }

  // Handle IPFS paths that don't use ipfs:// protocol
  if (uri.startsWith('Qm') || uri.startsWith('baf')) {
    return ipfs + uri
  }

  // Return as-is if it's already an HTTP(S) URL
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri
  }

  // If URI is relative, you might want to add a base URL
  if (uri.startsWith('/')) {
    throw new Error('Relative URIs need a base URL')
  }

  return uri
}

/**
 * Fetches and parses metadata from a URI
 */
const fetchMetadata = async (uri: string): Promise<TokenMetadata> => {
  try {
    const resolvedUri = await resolveURI(uri)

    // Handle data URIs
    if (resolvedUri.startsWith('data:application/json;base64,')) {
      const base64Data = resolvedUri.split(',')[1]
      const jsonString = Buffer.from(base64Data, 'base64').toString()
      return JSON.parse(jsonString)
    }

    // Fetch HTTP(S) URLs
    const response = await $fetch(resolvedUri)
    return response
  } catch (error) {
    throw new Error(`Failed to fetch metadata: ${error.message}`)
  }
}

/**
 * Fetches ERC721 token metadata
 */
export const getERC721Metadata = async (
  client: PublicClient,
  contractAddress: Address,
  tokenId: bigint
): Promise<TokenMetadata> => {
  try {
    const contract = getContract({
      address: contractAddress,
      abi: ERC721_ABI,
      client,
    })

    // Get token URI
    const tokenUri = await contract.read.tokenURI([tokenId])

    // Fetch and return metadata
    return await fetchMetadata(tokenUri)
  } catch (error) {
    throw new Error(`Failed to fetch ERC721 metadata: ${error.message}`)
  }
}

/**
 * Fetches ERC1155 token metadata
 */
export const getERC1155Metadata = async (
  client: PublicClient,
  contractAddress: Address,
  tokenId: bigint
): Promise<TokenMetadata> => {
  try {
    const contract = getContract({
      address: contractAddress,
      abi: ERC1155_ABI,
      client,
    })

    // Get token URI
    const uri = await contract.read.uri([tokenId])

    // ERC1155 uses a token ID placeholder {id} that needs to be replaced
    // The ID should be converted to a 64-character hexadecimal string
    const tokenIdHex = tokenId.toString(16).padStart(64, '0')
    const tokenUri = uri.replace('{id}', tokenIdHex)

    // Fetch and return metadata
    return await fetchMetadata(tokenUri)
  } catch (error) {
    throw new Error(`Failed to fetch ERC1155 metadata: ${error.message}`)
  }
}
