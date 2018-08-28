/* solium-disable security/no-block-members */

pragma solidity ^0.4.23;

import "../../../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../../../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "../../../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

// TODO: write informative comment here
contract TokenVesting is Ownable {
  using SafeMath for uint256;

  event Vested(uint256 amount);
  event Transferred(); // for transferring to new contract (for logic upgrade)
  event Revoked();
  event Debug(uint256 d);

  // Total number of tokens transferred to the beneciary so far
  uint256 public transferred;
  // Address to which tokens are transferred during vesting
  address public beneficiary;
  // Whether this contract has been revoked (tokens refunded to owner)
  bool public revoked;

  // Token contract for this grant.
  ERC20 public token;
  // UNIX timestamp of vesting cliff
  uint256 public cliffTimestamp;
  // Number of tokens vested at cliff
  uint256 public cliffAmount;
  // UNIX timestamps for all vesting event. For example, monthly vesting would
  // be represented by a set of timestamps one month apart.
  uint256[] public vestingTimestamps;
  // Number of tokens to vest as each time in vestingTimestamps elapses.
  uint256 public vestingAmount;

  constructor(
    address _beneficiary,
    ERC20 _token, // TODO: replace this with an ENS name!
    uint256 _cliffTimestamp,
    uint256 _cliffAmount,
    uint256[] _vestingTimestamps,
    uint256 _vestingAmount
  )
    public
  {
    // Verify that the timestamps are in ascending order, because we rely on
    // that elsewhere.
    if (_vestingTimestamps.length > 0) {
      require(
        _vestingTimestamps[0] > _cliffTimestamp,
        "vesting events must happen after cliff"
      );
    }
    for (uint i = 1; i < _vestingTimestamps.length; i++) {
      require(
        _vestingTimestamps[i - 1] < _vestingTimestamps[i],
        "vesting timestamps must be in ascending order"
      );
    }
    require(
      _cliffAmount > 0 || _vestingAmount > 0,
      "vesting contract has no value"
    );

    owner = msg.sender;
    transferred = 0;
    beneficiary = _beneficiary;
    token = _token;
    cliffTimestamp = _cliffTimestamp;
    cliffAmount = _cliffAmount;
    vestingTimestamps = _vestingTimestamps;
    vestingAmount = _vestingAmount;
  }

  // @dev Returns the total number of tokens in this grant
  function totalGrant() public view returns (uint256) {
    return cliffAmount.add(vestingAmount.mul(vestingTimestamps.length));
  }

  // @dev Returns the unvested tokens
  function unvested() public view returns (uint256) {
    return totalGrant().sub(vested());
  }

  // @dev Returns the total number of tokens vested so far
  function vested() public view returns (uint256) {
    if (now < cliffTimestamp) {
      return 0;
    }
    uint256 v = cliffAmount;
    for (uint i = 0; i < vestingTimestamps.length; i++) {
      if (now < vestingTimestamps[i]) {
        break;
      }
      v = v.add(vestingAmount);
    }
    return v;
  }

  // @dev Returns the number of tokens that can be transferred to the
  // beneficiary
  function transferrableAmount() public view returns (uint256) {
    return vested().sub(transferred);
  }

  // @dev Transfers vested tokens due to the beneficiary. Though this can be
  // called by anyone, the tokens may only be transferred to the beneficiary.
  function vest() public {
    uint256 amount = transferrableAmount();
    if (amount > 0) {
      transferred = transferred.add(amount);
      require(token.transfer(beneficiary, amount), "transfer failed");
      emit Vested(amount);
    }
  }

  // @dev Revoke this vesting contract, refunding any unvested tokens to the
  // contract owner. Vested tokens stay in the contract.
  function revoke() public onlyOwner {
    require(!revoked, "contract already revoked");

    uint256 balance = token.balanceOf(address(this));
    uint256 transferrable = transferrableAmount();
    uint256 refund = balance.sub(transferrable);
    revoked = true;
    require(token.transfer(owner, refund), "transfer failed");
    emit Revoked();
  }
}
