// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockBidDOS {
    bool public reverting;

    constructor() {
        reverting = true;
    }

    // Function to toggle revert state
    function setReverting(bool _reverting) external {
        reverting = _reverting;
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
        (bool success,) = auction.call(
            abi.encodeWithSignature("withdraw()")
        );
        require(success, "Withdraw failed");
        reverting = true;
    }

    // Revert when receiving ETH?
    receive() external payable {
        if (reverting) {
            revert("I should revert");
        }
    }

    fallback() external payable {
        if (reverting) {
            revert("I should revert");
        }
    }
}

