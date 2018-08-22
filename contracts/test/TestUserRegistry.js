const UserRegistry = artifacts.require('./UserRegistry.sol')

contract('UserRegistry', accounts => {
  let userRegistry

  beforeEach(async () => {
    userRegistry = await UserRegistry.deployed()
  })

  it('should be able to register a user', async function() {
    const register = await userRegistry.registerUser(
      [],
      [],
      0,
      0,
      [],
      { from: accounts[1] }
    )
    const identityAddress = await userRegistry.users(accounts[1])
    const newUserEvent = register.logs.find(e => e.event == 'NewUser')
    assert.equal(newUserEvent.args['_address'], accounts[1])
    assert.ok(identityAddress)
    assert.equal(newUserEvent.args['_identity'], identityAddress)
  })
})
