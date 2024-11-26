import { formatAbi } from 'abitype'
import { task } from 'hardhat/config'

task('export:abi:auctions', 'Exports an abi in its human readable form')
  .setAction(async (_, hre) => {
    const auctions = await hre.viem.deployContract('Auctions', [])

    console.log(formatAbi(auctions.abi))
  })

task('export:abi:erc721', 'Exports an abi in its human readable form')
  .setAction(async (_, hre) => {
    const erc721 = await hre.viem.deployContract('MockERC721', [])

    console.log(formatAbi(erc721.abi))
  })

task('export:abi:erc1155', 'Exports an abi in its human readable form')
  .setAction(async (_, hre) => {
    const erc1155 = await hre.viem.deployContract('MockERC1155', [])

    console.log(formatAbi(erc1155.abi))
  })

