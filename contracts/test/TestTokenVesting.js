const OriginToken = artifacts.require('OriginToken')
const TokenVesting = artifacts.require('TokenVesting')

const moment = require('moment')

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

const timeTravel = async function(delta) {
  await web3.currentProvider.send({
    jsonrpc: '2.0',
    method: 'evm_increaseTime',
    params: [delta],
    id: 0
  })
  await web3.currentProvider.send({
    jsonrpc: '2.0',
    method: 'evm_mine',
    params: [],
    id: 0
  })
}

async function blockTimestamp() {
  const block = await web3.eth.getBlock('latest');
  return block.timestamp;
}

contract('TestVesting', ([owner, beneficiary]) => {
  const initialSupply = 100000
  let token
  let startUnix
  let start

  beforeEach(async function() {
    token = await OriginToken.new(initialSupply)
    startUnix = await blockTimestamp()
    start = moment.unix(startUnix)
  })

  context('with 4 year vesting and a 1 year cliff', function() {
    const cliffAmount = 1200
    const vestAmount = 100
    const vestingPeriods = 36
    const totalGrant = cliffAmount + vestAmount * vestingPeriods
    let vesting
    let vestingCliff
    let vestingTimestamps

    beforeEach(async function() {
      vestingCliff = start.clone().add(1, 'year')
      vestingTimestamps = []
      for (let i = 1; i <= vestingPeriods; i++) {
        const vestingTimestamp = vestingCliff.clone().add(i, 'month')
        vestingTimestamps.push(vestingTimestamp.unix())
      }

      vesting = await TokenVesting.new(
        beneficiary,
        token.address,
        vestingCliff.unix(),
        cliffAmount,
        vestingTimestamps,
        vestAmount
      )
      await token.transfer(vesting.address, totalGrant)
    })

    it('calculates correct total grant', async function() {
      assert.equal(await vesting.totalGrant(), totalGrant)
    })

    it('does not vest before the cliff', async function() {
      const cliffSeconds = vestingCliff.unix() - await blockTimestamp()
      await timeTravel(cliffSeconds - 5)
      let vested = await vesting.vested()
      vested.should.bignumber.eq(0)
    })

    it('vests at the cliff', async function() {
      const cliffSeconds = vestingCliff.unix() - await blockTimestamp()
      await timeTravel(cliffSeconds)
      const vested = await vesting.vested()
      vested.should.bignumber.eq(cliffAmount)
    })

    it('transfers tokens at the cliff', async function() {
      const cliffSeconds = vestingCliff.unix() - await blockTimestamp()
      await timeTravel(cliffSeconds)
      const vested = await vesting.vested()
      vested.should.bignumber.eq(cliffAmount)
      await vesting.vest()
      const balance = await token.balanceOf(beneficiary)
      balance.should.bignumber.eq(balance, cliffAmount)
    })

    it('transfers cliff amount before first vesting event', async function() {
      const secs = vestingTimestamps[0] - await blockTimestamp()
      await timeTravel(secs - 5)
      const vested = await vesting.vested()
      vested.should.bignumber.eq(cliffAmount)
      await vesting.vest()
      const balance = await token.balanceOf(beneficiary)
      balance.should.bignumber.eq(balance, cliffAmount)
    })

    it('vests with the first vesting timestamp', async function() {
      await timeTravel(vestingTimestamps[0] - await blockTimestamp())
      const vested = await vesting.vested()
      const expVested = cliffAmount + vestAmount
      vested.should.bignumber.eq(expVested)
      await vesting.vest()
      const balance = await token.balanceOf(beneficiary)
      balance.should.bignumber.eq(balance, expVested)
    })

    it('vests fully after last vesting event', async function() {
      const lastVesting = vestingTimestamps[vestingTimestamps.length - 1]
      await timeTravel(lastVesting - await blockTimestamp())
      const vested = await vesting.vested()
      vested.should.bignumber.eq(totalGrant)
      await vesting.vest()
      const balance = await token.balanceOf(beneficiary)
      balance.should.bignumber.eq(balance, totalGrant)

      // make sure calling vest again doesn't do anything
      await timeTravel(86400 * 365)
      await vesting.vest()
      const newBalance = await token.balanceOf(beneficiary)
      newBalance.should.bignumber.eq(balance, totalGrant)
    })
  })

  // TODO: test revoke
  // TODO: test unvested function
  // TODO: test invalid vesting timestamp
  // TODO: test non-sorted vesting timestamps
})
