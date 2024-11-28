import * as dotenv from 'dotenv'
import { zeroAddress } from 'viem'
import type { HardhatUserConfig } from 'hardhat/config'
import type { HardhatNetworkUserConfig } from 'hardhat/types'
import '@nomicfoundation/hardhat-toolbox-viem'
import '@nomicfoundation/hardhat-ledger'
import 'hardhat-chai-matchers-viem'
import 'hardhat-contract-sizer'

import './tasks/accounts'
import './tasks/export-abis'

dotenv.config()

const LEDGER_ACCOUNTS: string[]|undefined = process.env.LEDGER_ACCOUNT ? [process.env.LEDGER_ACCOUNT] : undefined
const ACCOUNT_PRVKEYS: string[]|undefined = process.env.PRIVATE_KEY    ? [process.env.PRIVATE_KEY   ] : undefined
const DEPLOY_AUTH: string = process.env.DEPLOY_AUTH || zeroAddress
const REDEPLOY_PROTECTION: string = process.env.REDEPLOY_PROTECTION === 'true' ? `01` : `00`
const ENTROPY: string = process.env.ENTROPY || `0000000000000000000009`
const SALT: string = `${DEPLOY_AUTH}${REDEPLOY_PROTECTION}${ENTROPY}`

const HARDHAT_NETWORK_CONFIG: HardhatNetworkUserConfig = {
  chainId: 1337,
  ledgerAccounts: LEDGER_ACCOUNTS,
  forking: {
    enabled: process.env.FORK_MAINNET === 'true',
    url: process.env.MAINNET_URL || '',
    blockNumber: 20000000,
  },
}

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 100_000,
      },
    },
  },
  networks: {
    mainnet: {
      url: process.env.MAINNET_URL || '',
      accounts: ACCOUNT_PRVKEYS,
      ledgerAccounts: LEDGER_ACCOUNTS,
    },
    sepolia: {
      url: process.env.SEPOLIA_URL || '',
      accounts: ACCOUNT_PRVKEYS,
      ledgerAccounts: LEDGER_ACCOUNTS,
    },
    holesky: {
      url: process.env.HOLESKY_URL || '',
      accounts: ACCOUNT_PRVKEYS,
      ledgerAccounts: LEDGER_ACCOUNTS,
    },
    'base-mainnet': {
      url: 'https://mainnet.base.org',
      accounts: ACCOUNT_PRVKEYS,
      ledgerAccounts: LEDGER_ACCOUNTS,
    },
    'base-sepolia': {
      url: 'https://sepolia.base.org',
      accounts: ACCOUNT_PRVKEYS,
      ledgerAccounts: LEDGER_ACCOUNTS,
    },
    'shape-mainnet': {
      url: 'https://mainnet.shape.network',
      accounts: ACCOUNT_PRVKEYS,
      ledgerAccounts: LEDGER_ACCOUNTS,
    },
    'shape-sepolia': {
      url: 'https://sepolia.shape.network',
      accounts: ACCOUNT_PRVKEYS,
      ledgerAccounts: LEDGER_ACCOUNTS,
    },
    'zora-mainnet': {
      url: 'https://rpc.zora.energy',
      accounts: ACCOUNT_PRVKEYS,
      ledgerAccounts: LEDGER_ACCOUNTS,
    },
    'zora-sepolia': {
      url: 'https://sepolia.rpc.zora.energy',
      accounts: ACCOUNT_PRVKEYS,
      ledgerAccounts: LEDGER_ACCOUNTS,
    },
    localhost: {
      ...HARDHAT_NETWORK_CONFIG,
    },
    hardhat: HARDHAT_NETWORK_CONFIG,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    currency: 'USD',
    gasPrice: 10,
  },
  contractSizer: {
    alphaSort: true,
  },
  ignition: {
    strategyConfig: {
      create2: {
        salt: SALT,
      },
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY as string,
      sepolia: process.env.ETHERSCAN_API_KEY as string,
      holesky: process.env.ETHERSCAN_API_KEY as string,
      base:    process.env.ETHERSCAN_API_KEY as string,
    },
    customChains: [
      {
        network: 'base-mainnet',
        chainId: 8453,
        urls: {
          apiURL: 'https://api-basescan.org/api',
          browserURL: 'https://basescan.org'
        }
      },
      {
        network: 'base-sepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org'
        }
      },
      {
        network: 'shape-mainnet',
        chainId: 360,
        urls: {
          apiURL: 'https://shapescan.xyz/api',
          browserURL: 'https://shapescan.xyz'
        }
      },
      {
        network: 'shape-sepolia',
        chainId: 11011,
        urls: {
          apiURL: 'https://explorer-sepolia.shape.network/api',
          browserURL: 'https://explorer-sepolia.shape.network'
        }
      },
      {
        network: 'zora-mainnet',
        chainId: 7777777,
        urls: {
          apiURL: 'https://explorer.zora.energy/api',
          browserURL: 'https://explorer.zora.energy'
        }
      },
      {
        network: 'zora-sepolia',
        chainId: 999999999,
        urls: {
          apiURL: 'https://sepolia.explorer.zora.energy/api',
          browserURL: 'https://sepolia.explorer.zora.energy'
        }
      },
      {
        network: 'holesky',
        chainId: 17000,
        urls: {
          apiURL: 'https://api-holesky.etherscan.io/api',
          browserURL: 'https://holesky.etherscan.io'
        }
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
  mocha: {
    timeout: 120_000,
  },
}

export default config
