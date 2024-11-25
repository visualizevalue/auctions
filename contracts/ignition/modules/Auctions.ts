import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

const AuctionsModule = buildModule('Auctions', (m) => {
  const auctions = m.contract('Auctions')

  return { auctions }
})

export default AuctionsModule
