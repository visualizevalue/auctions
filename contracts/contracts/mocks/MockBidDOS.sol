// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract MockBidDOS is ERC721Holder {
    bool public reverting;
    bool public gasdrain;

    // Storage variables for gas draining
    mapping(uint256 => uint256) private storageMapping;
    uint256 private counter;

    constructor() {
        reverting = true;
        gasdrain = false;
    }

    // Function to toggle revert state
    function setReverting(bool _reverting) external {
        reverting = _reverting;
    }

    // Function to toggle revert state
    function setGasdrain(bool _gasdrain) external {
        gasdrain = _gasdrain;
    }

    // Function to bid on auction
    function bid(address auction, uint256 auctionId) external payable {
        (bool success,) = auction.call{value: msg.value}(
            abi.encodeWithSignature("bid(uint256)", auctionId)
        );
        require(success, "Bid failed");
    }

    // Function to withdraw a balance
    function withdraw(address auction) external {
        reverting = false;
        gasdrain = false;
        (bool success,) = auction.call(
            abi.encodeWithSignature("withdraw()")
        );
        require(success, "Withdraw failed");
        reverting = true;
    }

    // Revert when receiving ETH?
    receive() external payable {
        if (gasdrain) {
            return performExpensiveOperation();
        }

        if (reverting) {
            revert("I should revert");
        }
    }

    fallback() external payable {
        if (gasdrain) {
            return performExpensiveOperation();
        }

        if (reverting) {
            revert("I should revert");
        }
    }

    // Gas draining helper function
    function performExpensiveOperation() private {
        while (gasleft() > 0) {
            // Perform a computation to consume gas
            // Using keccak256 to prevent compiler optimizations
            keccak256(abi.encodePacked(block.timestamp, block.difficulty, gasleft()));
        }
    }
}

