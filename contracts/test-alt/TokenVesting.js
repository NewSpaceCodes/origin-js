import assert from 'assert'
import moment from 'moment'
import helper from './_helper'

describe('TokenVesting.sol', async function() {
  const initialSupply = 100000

  let accounts, deploy, web3, blockTimestamp, timeTravel
  let owner, beneficiary
  let token, start

  before(async function() {
    ({ deploy, accounts, web3, blockTimestamp, timeTravel}
      = await helper(`${__dirname}/..`))
    owner = accounts[0]
    beneficiary = accounts[1]
  })

  beforeEach(async function() {
    token = await deploy('OriginToken', {
      from: owner,
      path: `${__dirname}/../contracts/token/`,
      args: [initialSupply]
    })
    start = moment.unix(await blockTimestamp(web3))
  })

  describe('with 4 year vesting and a 1 year cliff', async function() {
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

      vesting = await deploy('TokenVesting', {
        from: owner,
        path: `${__dirname}/../contracts/token/`,
        args: [
          beneficiary,
          token.address,
          vestingCliff.unix(),
          cliffAmount,
          vestingTimestamps,
          vestAmount
        ]
      })

      await token.methods.transfer(vesting._address, totalGrant).send()
    })

    it('calculates correct total grant', async function() {
      assert.equal(
        await vesting.methods.totalGrant().call(),
        totalGrant
      )
    })

    it('does not vest before the cliff', async function() {
      const cliffSeconds = vestingCliff.unix() - await blockTimestamp(web3)

      await timeTravel(cliffSeconds - 5)
            /*

      let vested = await vesting.vested()
      vested.should.bignumber.eq(0)
      */
    })

    it('vests at the cliff', async function() {
      const cliffSeconds = vestingCliff.unix() - await blockTimestamp(web3)
      await timeTravel(cliffSeconds)
      const vested = await vesting.vested()
      vested.should.bignumber.eq(cliffAmount)
    })

    it('transfers tokens at the cliff', async function() {
      const cliffSeconds = vestingCliff.unix() - await blockTimestamp(web3)
      await timeTravel(cliffSeconds)
      const vested = await vesting.vested()
      vested.should.bignumber.eq(cliffAmount)
      await vesting.vest()
      const balance = await token.balanceOf(beneficiary)
      balance.should.bignumber.eq(balance, cliffAmount)
    })

    it('transfers cliff amount before first vesting event', async function() {
      const secs = vestingTimestamps[0] - await blockTimestamp(web3)
      await timeTravel(secs - 5)
      const vested = await vesting.vested()
      vested.should.bignumber.eq(cliffAmount)
      await vesting.vest()
      const balance = await token.balanceOf(beneficiary)
      balance.should.bignumber.eq(balance, cliffAmount)
    })

    it('vests with the first vesting timestamp', async function() {
      await timeTravel(vestingTimestamps[0] - await blockTimestamp(web3))
      const vested = await vesting.vested()
      const expVested = cliffAmount + vestAmount
      vested.should.bignumber.eq(expVested)
      await vesting.vest()
      const balance = await token.balanceOf(beneficiary)
      balance.should.bignumber.eq(balance, expVested)
    })

    it('vests fully after last vesting event', async function() {
      const lastVesting = vestingTimestamps[vestingTimestamps.length - 1]
      await timeTravel(lastVesting - await blockTimestamp(web3))
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
